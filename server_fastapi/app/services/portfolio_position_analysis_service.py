"""
Анализ открытых позиций в разрезе портфеля (scope): цена закупки, текущая цена,
рыночная рекомендация из БД + LLM-вердикт (Perplexity) либо fallback без ключа API.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import AppError
from app.core.time_utils import now_msk
from app.core.portfolio_scope import (
    PORTFOLIO_SCOPE_REAL,
    canonical_portfolio_scope,
    virtual_slug_from_scope,
)
from app.db.models import RealPortfolio
from app.repositories.market_repository import MarketRepository
from app.repositories.portfolio_position_recommendation_repository import (
    PortfolioPositionRecommendationRepository,
)
from app.services.portfolio_position_timing import (
    days_in_position_calendar,
    fifo_first_buy_at,
    first_buy_iso_for_json,
    tinkoff_operations_to_trade_likes,
)
from app.services.tinkoff_client import TinkoffApiClient
from app.services.virtual_portfolio_service import VirtualPortfolioService

logger = logging.getLogger(__name__)

_VERDICT_PROMPT_HEAD = """Ты финансовый аналитик. По портфелю ниже даны только факты из JSON (FIGI, тикер, сектор, средняя цена закупки, текущая цена, количество, нереализованный PnL, доля в портфеле при наличии; при наличии — firstBuyAt и daysInPosition). Не придумывай цифры вне JSON.

Системный рыночный сигнал по инструментам (если передан): краткая сводка BUY/SELL/HOLD или score по FIGI — не подменяй ею цены и PnL из JSON позиций.

Задача (всегда одна и та же):
1) По КАЖДОЙ позиции в JSON верни ровно одно действие: BUY, SELL или HOLD. BUY — только если явно рекомендуешь увеличить уже открытую позицию (докупка); если достаточно держать без докупки — HOLD, не BUY. SELL — закрыть/сократить. Не подменяй рыночный BUY из сводки на «докупку», если по фактам позиции уместнее HOLD.
2) Для каждой позиции укажи confidence от 0 до 1 и 1–3 причины, явно связывая вывод с ценой закупки, текущей ценой и PnL; при наличии daysInPosition / firstBuyAt учитывай горизонт удержания.
3) При необходимости добавь краткий блок по портфелю целиком (концентрация, общий риск) — без новых чисел вне JSON.

Формат ответа: СТРОГО один JSON-объект без markdown и текста до или после:
{"instruments":[{"figi":"...","action":"BUY|SELL|HOLD","confidence":0.62,"reasons":["..."]}],"portfolioComment":"опционально"}

Данные позиций (JSON):
"""


def _num(v: Any) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, dict) and "value" in v:
        try:
            return float(v.get("value") or 0)
        except (TypeError, ValueError):
            return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _clamp_action(a: str) -> str:
    u = (a or "").strip().upper()
    if u in {"BUY", "SELL", "HOLD"}:
        return u
    return "HOLD"


def _clamp01(x: Any, default: float = 0.5) -> float:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(1.0, v))


def extract_json_object(text: str) -> dict[str, Any] | None:
    """Вытаскивает первый JSON-объект из ответа модели."""
    s = (text or "").strip()
    if not s:
        return None
    s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s*```$", "", s)
    start = s.find("{")
    if start < 0:
        return None
    depth = 0
    for i in range(start, len(s)):
        c = s[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                chunk = s[start : i + 1]
                try:
                    return json.loads(chunk)
                except json.JSONDecodeError:
                    return None
    return None


class PortfolioPositionAnalysisService:
    def __init__(
        self,
        *,
        settings: Settings,
        market_repo: MarketRepository,
        virtual_portfolio_service: VirtualPortfolioService,
        ppr_repo: PortfolioPositionRecommendationRepository,
        tinkoff_client: TinkoffApiClient | None,
    ) -> None:
        self._settings = settings
        self._market_repo = market_repo
        self._vp = virtual_portfolio_service
        self._ppr = ppr_repo
        self._tinkoff = tinkoff_client

    async def collect_positions(
        self,
        session: AsyncSession,
        portfolio_scope: str,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        scope = canonical_portfolio_scope(portfolio_scope)
        slug = virtual_slug_from_scope(scope)
        if slug is not None:
            pl = await self._vp.get_portfolio_payload(session, profile_slug=slug)
            positions = self._normalize_virtual_positions(pl)
            meta = {
                "portfolioScope": scope,
                "source": "virtual_db",
                "totalValue": pl.get("totalValue"),
                "cash": pl.get("cash"),
            }
            return positions, meta

        if scope != PORTFOLIO_SCOPE_REAL:
            return [], {"portfolioScope": scope, "source": "none", "error": "unknown_scope"}

        if self._tinkoff:
            return await self._collect_real_live(session)

        return await self._collect_real_db(session)

    def _normalize_virtual_positions(self, pl: dict[str, Any]) -> list[dict[str, Any]]:
        tv = pl.get("totalValue")
        try:
            nav = float(tv) if tv is not None else 0.0
        except (TypeError, ValueError):
            nav = 0.0
        out: list[dict[str, Any]] = []
        for p in pl.get("positionsList") or []:
            if not isinstance(p, dict):
                continue
            figi = str(p.get("figi") or "").strip()
            if not figi:
                continue
            qty = p.get("quantity")
            try:
                qf = float(qty)
            except (TypeError, ValueError):
                continue
            if qf <= 0:
                continue
            cur = _num(p.get("currentPrice"))
            avg = _num(p.get("averagePositionPrice"))
            pnl_abs = p.get("unrealizedPnlRub")
            pnl_pct = p.get("priceDeltaPercent")
            pos_val = (cur or 0) * qf
            w_pct = (pos_val / nav * 100.0) if nav > 1e-6 else None
            out.append(
                {
                    "figi": figi,
                    "ticker": p.get("ticker"),
                    "sector": None,
                    "quantity": qf,
                    "averagePurchasePrice": avg,
                    "currentPrice": cur,
                    "currency": "RUB",
                    "unrealizedPnlAbs": float(pnl_abs) if pnl_abs is not None else None,
                    "unrealizedPnlPct": float(pnl_pct) if pnl_pct is not None else None,
                    "weightInNavPct": w_pct,
                    "firstBuyAt": p.get("firstBuyAt"),
                    "daysInPosition": p.get("daysInPosition"),
                }
            )
        return out

    async def _enrich_sector(self, session: AsyncSession, positions: list[dict[str, Any]]) -> None:
        for p in positions:
            figi = p.get("figi")
            if not figi:
                continue
            inst = await self._market_repo.get_instrument_by_figi(session, str(figi))
            if inst and getattr(inst, "sector", None):
                p["sector"] = inst.sector

    async def _collect_real_live(self, session: AsyncSession) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        assert self._tinkoff is not None
        portfolio = await asyncio.to_thread(self._tinkoff.get_portfolio)
        positions_raw = portfolio.get("positions") or []
        total_val = _num(portfolio.get("totalAmountPortfolio"))
        nav = float(total_val) if total_val is not None else 0.0
        trade_likes: list[dict[str, Any]] = []
        try:
            end_utc = datetime.now(timezone.utc)
            start_utc = end_utc - timedelta(days=730)
            from_ts = start_utc.isoformat().replace("+00:00", "Z")
            to_ts = end_utc.isoformat().replace("+00:00", "Z")
            ops_raw = await asyncio.to_thread(
                self._tinkoff.get_operations,
                None,
                from_ts,
                to_ts,
            )
            trade_likes = tinkoff_operations_to_trade_likes(
                ops_raw if isinstance(ops_raw, dict) else {}
            )
        except Exception as e:
            logger.warning("real portfolio: get_operations for firstBuyAt failed: %s", e)

        out: list[dict[str, Any]] = []
        for p in positions_raw:
            if not isinstance(p, dict):
                continue
            figi = str(p.get("figi") or "").strip()
            if not figi:
                continue
            qty = int(p.get("quantity") or 0)
            if qty <= 0:
                continue
            avg = _num(p.get("averagePositionPrice"))
            cur = _num(p.get("currentPrice"))
            pnl_abs = None
            pnl_pct = None
            if avg is not None and cur is not None and avg > 1e-9:
                pnl_pct = (cur / avg - 1.0) * 100.0
                pnl_abs = (cur - avg) * float(qty)
            pos_val = (cur or 0) * float(qty)
            w_pct = (pos_val / nav * 100.0) if nav > 1e-6 else None
            first_dt = fifo_first_buy_at(figi, trade_likes)
            out.append(
                {
                    "figi": figi,
                    "ticker": (p.get("ticker") or "").strip() or None,
                    "sector": None,
                    "quantity": float(qty),
                    "averagePurchasePrice": avg,
                    "currentPrice": cur,
                    "currency": "RUB",
                    "unrealizedPnlAbs": pnl_abs,
                    "unrealizedPnlPct": pnl_pct,
                    "weightInNavPct": w_pct,
                    "firstBuyAt": first_buy_iso_for_json(first_dt),
                    "daysInPosition": days_in_position_calendar(first_dt, now_msk()),
                }
            )
        await self._enrich_sector(session, out)
        meta = {
            "portfolioScope": PORTFOLIO_SCOPE_REAL,
            "source": "tinkoff_live",
            "totalValue": nav,
            "degraded": bool(portfolio.get("_degraded")),
        }
        return out, meta

    async def _collect_real_db(self, session: AsyncSession) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        row = await session.scalar(select(RealPortfolio).where(RealPortfolio.id == 1).limit(1))
        nav = float(row.total_value) if row and row.total_value is not None else 0.0
        pos_map = dict((row.positions or {})) if row else {}
        figis = [str(f) for f in pos_map if f]
        prices = await self._market_repo.map_last_prices_by_figis(session, figis)
        out: list[dict[str, Any]] = []
        for figi, qty_raw in pos_map.items():
            figi_s = str(figi).strip()
            if not figi_s:
                continue
            try:
                qty = float(qty_raw)
            except (TypeError, ValueError):
                continue
            if qty <= 0:
                continue
            lp = prices.get(figi_s)
            cur = float(lp) if lp is not None else None
            pos_val = (cur or 0) * qty
            w_pct = (pos_val / nav * 100.0) if nav > 1e-6 else None
            inst = await self._market_repo.get_instrument_by_figi(session, figi_s)
            out.append(
                {
                    "figi": figi_s,
                    "ticker": inst.ticker if inst else None,
                    "sector": inst.sector if inst else None,
                    "quantity": qty,
                    "averagePurchasePrice": None,
                    "currentPrice": cur,
                    "currency": "RUB",
                    "unrealizedPnlAbs": None,
                    "unrealizedPnlPct": None,
                    "weightInNavPct": w_pct,
                    "firstBuyAt": None,
                    "daysInPosition": None,
                }
            )
        meta = {
            "portfolioScope": PORTFOLIO_SCOPE_REAL,
            "source": "real_db",
            "totalValue": nav,
            "cached": True,
        }
        return out, meta

    async def market_signals_by_figi(
        self, session: AsyncSession, figis: list[str]
    ) -> dict[str, dict[str, Any]]:
        uniq = [f for f in dict.fromkeys(figis) if f and str(f).strip()]
        rows = await self._market_repo.get_latest_recommendations_for_figis(session, uniq)
        out: dict[str, dict[str, Any]] = {}
        for r in rows:
            out[r.figi] = {
                "recommendation": r.recommendation,
                "score": float(r.score) if r.score is not None else None,
                "confidence": float(r.confidence) if r.confidence is not None else None,
            }
        return out

    def build_verdict_prompt(
        self,
        *,
        portfolio_scope: str,
        positions: list[dict[str, Any]],
        portfolio_meta: dict[str, Any],
        market_by_figi: dict[str, dict[str, Any]],
    ) -> str:
        payload = {
            "portfolioScope": portfolio_scope,
            "portfolioMeta": portfolio_meta,
            "positions": positions,
        }
        signals = {k: market_by_figi.get(k) for k in [p["figi"] for p in positions if p.get("figi")]}
        tail = json.dumps(
            {"positionsPayload": payload, "marketSignalsByFigi": signals},
            ensure_ascii=False,
            indent=2,
        )
        return _VERDICT_PROMPT_HEAD + tail

    async def _call_perplexity(self, prompt: str) -> str:
        key = (self._settings.perplexity_api_key or "").strip()
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                r = await client.post(
                    "https://api.perplexity.ai/chat/completions",
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                    json={
                        "model": "sonar",
                        "messages": [{"role": "user", "content": prompt}],
                    },
                )
                r.raise_for_status()
                data = r.json()
                choices = data.get("choices") or []
                if choices:
                    msg = (choices[0].get("message") or {}).get("content") or ""
                    if isinstance(msg, str):
                        return msg.strip()
        except Exception as e:
            logger.warning("Perplexity portfolio verdict failed: %s", e)
        return ""

    def parse_llm_verdict(self, raw: str) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
        obj = extract_json_object(raw)
        if not isinstance(obj, dict):
            return [], None
        instruments = obj.get("instruments")
        if not isinstance(instruments, list):
            return [], obj
        parsed: list[dict[str, Any]] = []
        for it in instruments:
            if not isinstance(it, dict):
                continue
            figi = str(it.get("figi") or "").strip()
            if not figi:
                continue
            parsed.append(
                {
                    "figi": figi,
                    "action": _clamp_action(str(it.get("action") or "HOLD")),
                    "confidence": _clamp01(it.get("confidence"), 0.5),
                    "reasons": it.get("reasons") if isinstance(it.get("reasons"), list) else [],
                }
            )
        return parsed, obj

    async def run_verdict(
        self,
        session: AsyncSession,
        *,
        portfolio_scope: str,
        figi_filter: list[str] | None = None,
        persist: bool = True,
    ) -> dict[str, Any]:
        scope = canonical_portfolio_scope(portfolio_scope)
        positions, meta = await self.collect_positions(session, scope)
        if figi_filter:
            allow = {str(f).strip() for f in figi_filter if f and str(f).strip()}
            positions = [p for p in positions if str(p.get("figi")) in allow]
        if not positions:
            return {
                "portfolioScope": scope,
                "analysisRunId": None,
                "saved": 0,
                "positions": [],
                "meta": meta,
                "message": "no_positions",
            }

        figis = [str(p["figi"]) for p in positions]
        market_by_figi = await self.market_signals_by_figi(session, figis)
        prompt = self.build_verdict_prompt(
            portfolio_scope=scope,
            positions=positions,
            portfolio_meta=meta,
            market_by_figi=market_by_figi,
        )
        raw_text = await self._call_perplexity(prompt)
        parsed, full_obj = self.parse_llm_verdict(raw_text)
        if not parsed:
            return {
                "portfolioScope": scope,
                "analysisRunId": None,
                "saved": 0,
                "positions": positions,
                "meta": meta,
                "verdicts": [],
                "llmSource": "no_llm",
                "message": "no_llm_verdict",
                "rawLlmTextPreview": (raw_text[:500] + "…") if len(raw_text) > 500 else raw_text,
            }

        source = "perplexity"
        by_figi = {x["figi"]: x for x in parsed}
        run_id = uuid.uuid4()
        saved = 0
        for p in positions:
            figi = str(p["figi"])
            verdict = by_figi.get(figi) or {
                "figi": figi,
                "action": "HOLD",
                "confidence": 0.5,
                "reasons": ["no_llm_row"],
            }
            m = market_by_figi.get(figi) or {}
            ms = m.get("score")
            mc = m.get("confidence")
            llm_payload: dict[str, Any] = {
                "source": source,
                "parsed": verdict,
                "portfolioComment": (full_obj or {}).get("portfolioComment"),
            }
            if persist:
                await self._ppr.add_row(
                    session,
                    portfolio_scope=scope,
                    figi=figi,
                    analysis_run_id=run_id,
                    market_score=Decimal(str(round(float(ms), 6))) if ms is not None else None,
                    market_confidence=Decimal(str(round(float(mc), 6))) if mc is not None else None,
                    final_action=verdict["action"],
                    final_confidence=Decimal(str(round(float(verdict["confidence"]), 6))),
                    position_snapshot=dict(p),
                    llm_payload=llm_payload,
                    raw_llm_text=raw_text if raw_text else None,
                )
                saved += 1

        return {
            "portfolioScope": scope,
            "analysisRunId": str(run_id),
            "saved": saved,
            "positions": positions,
            "meta": meta,
            "verdicts": [
                by_figi.get(
                    str(p["figi"]),
                    {
                        "figi": str(p["figi"]),
                        "action": "HOLD",
                        "confidence": 0.5,
                        "reasons": ["missing_in_llm_response"],
                    },
                )
                for p in positions
            ],
            "llmSource": source,
            "rawLlmTextPreview": (raw_text[:500] + "…") if len(raw_text) > 500 else raw_text,
        }

    async def get_manual_prompt_bundle(
        self,
        session: AsyncSession,
        *,
        portfolio_scope: str,
        figi_filter: list[str] | None = None,
    ) -> dict[str, Any]:
        """Промпт и порядок FIGI для ручной вставки во внешнюю нейросеть (как GET prompt-chunk для жюри)."""
        scope = canonical_portfolio_scope(portfolio_scope)
        positions_all, meta = await self.collect_positions(session, scope)
        if figi_filter:
            by_figi = {str(p.get("figi")): p for p in positions_all if p.get("figi")}
            positions = []
            seen: set[str] = set()
            for f in figi_filter:
                ff = str(f).strip()
                if not ff or ff in seen:
                    continue
                if ff in by_figi:
                    positions.append(by_figi[ff])
                    seen.add(ff)
        else:
            positions = list(positions_all)
        if not positions:
            return {
                "portfolioScope": scope,
                "figis": [],
                "prompt": "",
                "meta": meta,
                "message": "no_positions",
            }
        figis = [str(p["figi"]) for p in positions]
        market_by_figi = await self.market_signals_by_figi(session, figis)
        prompt = self.build_verdict_prompt(
            portfolio_scope=scope,
            positions=positions,
            portfolio_meta=meta,
            market_by_figi=market_by_figi,
        )
        return {
            "portfolioScope": scope,
            "figis": figis,
            "prompt": prompt,
            "meta": meta,
        }

    async def apply_manual_external_verdict(
        self,
        session: AsyncSession,
        *,
        portfolio_scope: str,
        figis: list[str],
        external_raw: str,
    ) -> dict[str, Any]:
        """Сохраняет вердикт из сырого ответа внешней модели; FIGI и порядок — как в GET manual/prompt."""
        scope = canonical_portfolio_scope(portfolio_scope)
        positions_all, meta = await self.collect_positions(session, scope)
        by_figi = {str(p.get("figi")): p for p in positions_all if p.get("figi")}
        posted = [str(f).strip() for f in figis if str(f).strip()]
        if not posted:
            raise AppError("BAD_REQUEST", message="Пустой список FIGI")
        positions: list[dict[str, Any]] = []
        for f in posted:
            if f not in by_figi:
                raise AppError(
                    "BAD_REQUEST",
                    message=f"FIGI отсутствует в текущем портфеле: {f}",
                    details={"figi": f, "posted": posted},
                )
            positions.append(by_figi[f])

        raw = (external_raw or "").strip()
        if not raw:
            raise AppError("BAD_REQUEST", message="Пустой ответ внешней модели")

        parsed, full_obj = self.parse_llm_verdict(raw)
        if not parsed:
            raise AppError(
                "BAD_REQUEST",
                message=(
                    "Не удалось разобрать JSON. Нужен объект с массивом instruments[]: "
                    'figi, action (BUY|SELL|HOLD), confidence, reasons[].'
                ),
            )

        figis_in_json = {x["figi"] for x in parsed}
        missing_in_response = [f for f in posted if f not in figis_in_json]
        market_by_figi = await self.market_signals_by_figi(session, posted)
        verdict_by_figi = {x["figi"]: x for x in parsed}
        run_id = uuid.uuid4()
        saved = 0
        for p in positions:
            figi = str(p["figi"])
            verdict = verdict_by_figi.get(figi) or {
                "figi": figi,
                "action": "HOLD",
                "confidence": 0.5,
                "reasons": ["no_row_in_manual_json"],
            }
            m = market_by_figi.get(figi) or {}
            ms = m.get("score")
            mc = m.get("confidence")
            llm_payload: dict[str, Any] = {
                "source": "manual_external",
                "parsed": verdict,
                "portfolioComment": (full_obj or {}).get("portfolioComment"),
            }
            if missing_in_response:
                llm_payload["missingFigisInResponse"] = missing_in_response
            await self._ppr.add_row(
                session,
                portfolio_scope=scope,
                figi=figi,
                analysis_run_id=run_id,
                market_score=Decimal(str(round(float(ms), 6))) if ms is not None else None,
                market_confidence=Decimal(str(round(float(mc), 6))) if mc is not None else None,
                final_action=verdict["action"],
                final_confidence=Decimal(str(round(float(verdict["confidence"]), 6))),
                position_snapshot=dict(p),
                llm_payload=llm_payload,
                raw_llm_text=raw,
            )
            saved += 1

        return {
            "portfolioScope": scope,
            "analysisRunId": str(run_id),
            "saved": saved,
            "missingFigisInResponse": missing_in_response,
            "llmSource": "manual_external",
        }

    async def positions_with_latest_verdicts(
        self,
        session: AsyncSession,
        portfolio_scope: str,
    ) -> dict[str, Any]:
        scope = canonical_portfolio_scope(portfolio_scope)
        positions, meta = await self.collect_positions(session, scope)
        latest = await self._ppr.latest_by_figi_map(session, portfolio_scope=scope)
        items: list[dict[str, Any]] = []
        for p in positions:
            figi = str(p["figi"])
            row = latest.get(figi)
            items.append(
                {
                    "position": p,
                    "latestVerdict": None
                    if row is None
                    else {
                        "finalAction": row.final_action,
                        "finalConfidence": float(row.final_confidence),
                        "createdAt": row.created_at.isoformat(),
                        "analysisRunId": str(row.analysis_run_id),
                        "marketScore": float(row.market_score) if row.market_score is not None else None,
                    },
                }
            )
        return {"portfolioScope": scope, "meta": meta, "items": items}

    async def list_latest_items(
        self,
        session: AsyncSession,
        portfolio_scope: str,
        *,
        limit: int = 100,
    ) -> dict[str, Any]:
        scope = canonical_portfolio_scope(portfolio_scope)
        rows = await self._ppr.list_recent(session, portfolio_scope=scope, limit=limit)
        seen: set[str] = set()
        items: list[dict[str, Any]] = []
        for r in rows:
            if r.figi in seen:
                continue
            seen.add(r.figi)
            items.append(
                {
                    "figi": r.figi,
                    "finalAction": r.final_action,
                    "finalConfidence": float(r.final_confidence),
                    "createdAt": r.created_at.isoformat(),
                    "analysisRunId": str(r.analysis_run_id),
                    "positionSnapshot": r.position_snapshot,
                    "llmPayload": r.llm_payload,
                }
            )
        return {"portfolioScope": scope, "items": items}
