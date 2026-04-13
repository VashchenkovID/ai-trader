"""Виртуальный (paper) портфель: снимок в БД, обновление при исполнении заявок."""

from __future__ import annotations

import contextlib
import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.paper_trajectory_log import append_paper_mdp_event
from app.core.time_utils import now_msk
from app.db.models import AppSetting, TradingRequest, VirtualPortfolio, VirtualPortfolioNavSnapshot
from app.core.virtual_profiles import VIRTUAL_PROFILE_SLUGS, normalize_virtual_profile
from app.repositories.market_repository import MarketRepository
from app.repositories.virtual_portfolio_repository import VirtualPortfolioRepository
from app.services.execution_simulator import simulate_execution_detailed
from app.services.portfolio_position_timing import (
    days_in_position_calendar,
    fifo_first_buy_at,
    first_buy_iso_for_json,
)
from app.services.virtual_portfolio_metrics import compute_trade_metrics

logger = logging.getLogger(__name__)

_BACKFILL_SETTING_KEY = "virtual_portfolio.backfill_v1_done"
_MAX_TRADES = 500


def _position_metrics_from_trades(figi: str, trades: list[Any]) -> dict[str, Any]:
    """
    Средняя цена позиции (учёт средней себестоимости), подсказки тикера/имени из сделок,
    последняя цена сделки для подстановки, если нет инструмента в БД.
    """
    figi_s = str(figi).strip()
    qty = 0.0
    cost = 0.0
    ticker: str | None = None
    name: str | None = None
    last_unit: float | None = None
    relevant = [
        t
        for t in trades
        if isinstance(t, dict) and str(t.get("figi") or "").strip() == figi_s
    ]
    relevant.sort(key=lambda t: str(t.get("at") or ""))
    for t in relevant:
        action = str(t.get("action") or "").upper()
        q = int(t.get("quantity") or 0)
        amt = float(t.get("amount") or 0)
        up = t.get("unitPrice")
        if up is not None:
            try:
                last_unit = float(up)
            except (TypeError, ValueError):
                pass
        if action == "BUY" and q > 0:
            qty += float(q)
            cost += amt
            if t.get("ticker"):
                ticker = str(t.get("ticker"))
            if t.get("name"):
                name = str(t.get("name"))
            if last_unit is None and q:
                last_unit = amt / float(q)
        elif action == "SELL" and q > 0 and qty > 1e-9:
            avg = cost / qty
            sell_q = min(float(q), qty)
            cost -= avg * sell_q
            qty -= sell_q
            if last_unit is None and q:
                last_unit = amt / float(q)
    avg_px: float | None = (cost / qty) if qty > 1e-9 else None
    return {
        "averagePositionPrice": avg_px,
        "ticker": ticker,
        "name": name,
        "lastTradeUnitPrice": last_unit,
    }


class VirtualPortfolioService:
    def __init__(
        self,
        market_repo: MarketRepository,
        repo: VirtualPortfolioRepository,
    ) -> None:
        self._market_repo = market_repo
        self._repo = repo

    async def _read_initial_capital_decimal(self, session: AsyncSession) -> Decimal:
        row = await session.scalar(
            select(AppSetting.value).where(AppSetting.key == "portfolio.virtual.initial_capital").limit(1)
        )
        raw = str(row).strip() if row is not None else ""
        if not raw:
            raw = "1000000"
        try:
            d = Decimal(raw)
        except Exception:
            d = Decimal("1000000")
        return d if d > 0 else Decimal("1000000")

    async def get_or_create_snapshot(
        self, session: AsyncSession, profile_slug: str | None = None
    ) -> VirtualPortfolio:
        slug = normalize_virtual_profile(profile_slug)
        row = await self._repo.get_by_profile(session, slug)
        if row is not None:
            return row
        initial = await self._read_initial_capital_decimal(session)
        cash_f = float(initial)
        now = now_msk()
        row = VirtualPortfolio(
            profile_slug=slug,
            cash=cash_f,
            positions={},
            trades=[],
            total_value=cash_f,
            positions_value=0.0,
            initial_capital=cash_f,
            version=1,
            last_updated=now,
        )
        session.add(row)
        await session.flush()
        return row

    async def ensure_bootstrap_row(self, session: AsyncSession) -> None:
        for slug in VIRTUAL_PROFILE_SLUGS:
            await self.get_or_create_snapshot(session, profile_slug=slug)

    async def upsert_nav_snapshot(
        self,
        session: AsyncSession,
        profile_slug: str,
        nav_date: date,
        total_value: float,
    ) -> None:
        slug = normalize_virtual_profile(profile_slug)
        stmt = (
            select(VirtualPortfolioNavSnapshot)
            .where(
                VirtualPortfolioNavSnapshot.profile_slug == slug,
                VirtualPortfolioNavSnapshot.nav_date == nav_date,
            )
            .limit(1)
        )
        existing = await session.scalar(stmt)
        tv = Decimal(str(total_value))
        if existing is not None:
            existing.total_value = tv  # type: ignore[assignment]
        else:
            session.add(
                VirtualPortfolioNavSnapshot(profile_slug=slug, nav_date=nav_date, total_value=tv)
            )
        await session.flush()

    async def load_nav_points(
        self,
        session: AsyncSession,
        profile_slug: str,
        *,
        limit_days: int = 140,
    ) -> list[tuple[date, float]]:
        slug = normalize_virtual_profile(profile_slug)
        end = now_msk().date()
        start = end - timedelta(days=limit_days)
        try:
            stmt = (
                select(VirtualPortfolioNavSnapshot.nav_date, VirtualPortfolioNavSnapshot.total_value)
                .where(
                    VirtualPortfolioNavSnapshot.profile_slug == slug,
                    VirtualPortfolioNavSnapshot.nav_date >= start,
                )
                .order_by(VirtualPortfolioNavSnapshot.nav_date.asc())
            )
            rows = (await session.execute(stmt)).all()
            return [(r[0], float(r[1])) for r in rows]
        except Exception:
            return []

    async def snapshot_all_profiles_nav_today(self, session: AsyncSession) -> dict[str, Any]:
        """Cron: один снимок NAV на календарный день по каждому профилю."""
        d = now_msk().date()
        for slug in VIRTUAL_PROFILE_SLUGS:
            row = await self.get_or_create_snapshot(session, profile_slug=slug)
            await self.recalculate_totals(session, row)
            await session.flush()
            tv = float(row.total_value) if row.total_value is not None else 0.0
            await self.upsert_nav_snapshot(session, slug, d, tv)
        return {"ok": True, "navDate": str(d), "profiles": list(VIRTUAL_PROFILE_SLUGS)}

    async def get_available_cash_for_sizing(
        self, session: AsyncSession, profile_slug: str | None = None
    ) -> Decimal | None:
        """Свободный cash для расчёта размера BUY; None если строки ещё нет."""
        row = await self._repo.get_by_profile(session, normalize_virtual_profile(profile_slug))
        if row is None:
            return None
        return Decimal(str(row.cash)) if row.cash is not None else Decimal("0")

    async def get_position_quantity(
        self, session: AsyncSession, figi: str, profile_slug: str | None = None
    ) -> int:
        """Количество бумаг по FIGI в виртуальном портфеле (0, если строки или позиции нет)."""
        row = await self._repo.get_by_profile(session, normalize_virtual_profile(profile_slug))
        if row is None:
            return 0
        positions = dict(row.positions or {})
        key = str(figi).strip()
        if not key:
            return 0
        raw = positions.get(key)
        if raw is None:
            raw = positions.get(figi)
        try:
            q = int(raw)
        except (TypeError, ValueError):
            try:
                q = int(float(raw))
            except (TypeError, ValueError):
                return 0
        return max(0, q)

    async def recalculate_totals(self, session: AsyncSession, row: VirtualPortfolio) -> None:
        positions = dict(row.positions or {})
        trades = list(row.trades or [])
        pv = 0.0
        for figi, qty_raw in positions.items():
            if not figi:
                continue
            try:
                q = float(qty_raw)
            except (TypeError, ValueError):
                continue
            inst = await self._market_repo.get_instrument_by_figi(session, str(figi))
            if inst and inst.last_price is not None:
                pv += q * float(inst.last_price)
            else:
                m = _position_metrics_from_trades(str(figi), trades)
                lu = m.get("lastTradeUnitPrice")
                if lu is not None:
                    pv += q * float(lu)
        row.positions_value = pv
        row.total_value = float(row.cash) + pv
        row.last_updated = now_msk()

    async def apply_paper_execution(
        self,
        session: AsyncSession,
        req: TradingRequest,
        *,
        actual_price: Decimal | None,
        actual_amount: Decimal | None,
    ) -> None:
        prof = normalize_virtual_profile(
            getattr(req, "virtual_profile_slug", None) or None
        )
        row = await self.get_or_create_snapshot(session, profile_slug=prof)
        pre_snapshot = {
            "cash": float(row.cash) if row.cash is not None else 0.0,
            "totalValue": float(row.total_value) if row.total_value is not None else 0.0,
            "positionsValue": float(row.positions_value) if row.positions_value is not None else 0.0,
            "positionsKeys": list((row.positions or {}).keys()),
        }
        positions = dict(row.positions or {})
        cash = float(row.cash)
        action = (req.action or "BUY").upper()
        qty = int(req.quantity) if req.quantity else 0

        if action == "BUY":
            cost = float(actual_amount if actual_amount is not None else req.budget)
            cash -= cost
            positions[req.figi] = int(positions.get(req.figi, 0)) + qty
            amount_for_trade = cost
        elif action == "SELL":
            if actual_amount is not None:
                proceeds = float(actual_amount)
            else:
                proceeds = float(req.price) * qty
            cash += proceeds
            prev = int(positions.get(req.figi, 0))
            new_q = prev - qty
            if new_q <= 0:
                positions.pop(req.figi, None)
            else:
                positions[req.figi] = new_q
            amount_for_trade = proceeds
        else:
            return

        sim = simulate_execution_detailed(notional_rub=float(amount_for_trade))
        logger.info("paper_execution_sim figi=%s profile=%s %s", req.figi, prof, sim)

        unit_price: float | None = None
        if qty > 0:
            unit_price = amount_for_trade / float(qty)
        elif req.price is not None:
            with contextlib.suppress(Exception):
                unit_price = float(req.price)

        trades = list(row.trades or [])
        trades.append(
            {
                "requestId": str(req.id),
                "figi": req.figi,
                "action": action,
                "quantity": qty,
                "amount": amount_for_trade,
                "at": (req.executed_at or now_msk()).isoformat(),
                "ticker": req.ticker,
                "name": req.name,
                "unitPrice": unit_price,
            }
        )
        if len(trades) > _MAX_TRADES:
            trades = trades[-_MAX_TRADES:]

        row.cash = cash
        row.positions = positions
        row.trades = trades
        row.version = (row.version or 1) + 1
        await session.flush()
        await self.recalculate_totals(session, row)
        await session.flush()
        post_snapshot = {
            "cash": float(row.cash) if row.cash is not None else 0.0,
            "totalValue": float(row.total_value) if row.total_value is not None else 0.0,
            "positionsValue": float(row.positions_value) if row.positions_value is not None else 0.0,
            "positionsKeys": list((row.positions or {}).keys()),
        }
        append_paper_mdp_event(
            {
                "kind": "paper_execution",
                "mode": "paper",
                "virtualProfile": prof,
                "requestId": str(req.id),
                "figi": req.figi,
                "action": action,
                "quantity": qty,
                "confidence": float(req.confidence) if req.confidence is not None else None,
                "score": float(req.score) if req.score is not None else None,
                "pre": pre_snapshot,
                "post": post_snapshot,
                "actualPrice": float(actual_price) if actual_price is not None else None,
                "actualAmount": float(actual_amount) if actual_amount is not None else None,
            }
        )

    async def get_portfolio_payload(
        self,
        session: AsyncSession,
        profile_slug: str | None = None,
        *,
        include_trades: bool = False,
    ) -> dict[str, Any]:
        slug = normalize_virtual_profile(profile_slug)
        row = await self.get_or_create_snapshot(session, profile_slug=slug)
        await self.recalculate_totals(session, row)
        await session.flush()
        positions_map: dict[str, Any] = dict(row.positions or {})
        trades_list: list[Any] = list(row.trades or [])
        positions_list: list[dict[str, Any]] = []
        for figi, qty_raw in positions_map.items():
            if not figi:
                continue
            try:
                qty_num = int(qty_raw)
            except (TypeError, ValueError):
                qty_num = qty_raw
            inst = await self._market_repo.get_instrument_by_figi(session, str(figi))
            metrics = _position_metrics_from_trades(str(figi), trades_list)
            lp = float(inst.last_price) if inst and inst.last_price is not None else 0.0
            if lp <= 0 and metrics.get("lastTradeUnitPrice") is not None:
                lp = float(metrics["lastTradeUnitPrice"])
            ticker_out = (inst.ticker if inst else None) or metrics.get("ticker")
            name_out = (inst.name if inst else None) or metrics.get("name")
            avg_px = metrics.get("averagePositionPrice")
            instrument_missing = inst is None
            price_delta: float | None = None
            price_delta_pct: float | None = None
            unrealized_pnl: float | None = None
            try:
                qf = float(qty_num) if qty_num is not None else 0.0
                cur = float(lp)
                if avg_px is not None and qf > 1e-9 and cur > 1e-9:
                    au = float(avg_px)
                    if au > 1e-9:
                        price_delta = cur - au
                        price_delta_pct = (cur / au - 1.0) * 100.0
                        unrealized_pnl = (cur - au) * qf
            except (TypeError, ValueError):
                pass
            first_dt = fifo_first_buy_at(str(figi), trades_list)
            positions_list.append(
                {
                    "figi": str(figi),
                    "quantity": qty_num,
                    "ticker": ticker_out,
                    "name": name_out,
                    "currentPrice": lp,
                    "instrumentLastPrice": float(inst.last_price)
                    if inst and inst.last_price is not None
                    else None,
                    "averagePositionPrice": avg_px,
                    "priceDelta": price_delta,
                    "priceDeltaPercent": price_delta_pct,
                    "unrealizedPnlRub": unrealized_pnl,
                    "instrumentMissing": instrument_missing,
                    "firstBuyAt": first_buy_iso_for_json(first_dt),
                    "daysInPosition": days_in_position_calendar(first_dt, now_msk()),
                }
            )
        ic = float(row.initial_capital) if row.initial_capital is not None else 0.0
        tv = float(row.total_value) if row.total_value is not None else ic
        nav_points = await self.load_nav_points(session, slug, limit_days=140)
        metrics = compute_trade_metrics(
            trades=trades_list,
            initial_capital=ic,
            total_value=tv,
            nav_points=nav_points if len(nav_points) >= 3 else None,
        )
        out: dict[str, Any] = {
            "profileSlug": slug,
            "cash": row.cash,
            "positions": positions_map,
            "positionsList": positions_list,
            "totalValue": row.total_value,
            "positionsValue": row.positions_value,
            "initialCapital": row.initial_capital,
            "isVirtual": True,
            "tradeMetrics": metrics,
        }
        if include_trades:
            out["trades"] = trades_list[-200:] if len(trades_list) > 200 else trades_list
        return out

    async def list_all_profiles_payload(self, session: AsyncSession) -> list[dict[str, Any]]:
        """Сводка по всем виртуальным профилям (дашборд)."""
        await self.ensure_bootstrap_row(session)
        out: list[dict[str, Any]] = []
        for row in await self._repo.list_all(session):
            pl = await self.get_portfolio_payload(session, profile_slug=row.profile_slug)
            out.append(
                {
                    "profileSlug": row.profile_slug,
                    "totalValue": pl.get("totalValue"),
                    "positionsValue": pl.get("positionsValue"),
                    "cash": pl.get("cash"),
                    "initialCapital": pl.get("initialCapital"),
                    "tradeMetrics": pl.get("tradeMetrics"),
                    "positionsList": pl.get("positionsList") or [],
                }
            )
        return out

    async def _get_setting_str(self, session: AsyncSession, key: str) -> str | None:
        row = await session.scalar(select(AppSetting.value).where(AppSetting.key == key).limit(1))
        if row is None:
            return None
        s = str(row).strip()
        return s if s else None

    async def _set_setting_str(self, session: AsyncSession, key: str, value: str) -> None:
        row = await session.get(AppSetting, key)
        if row is None:
            session.add(
                AppSetting(
                    key=key,
                    value=value,
                    value_type="string",
                    module="portfolio",
                    description="Системная отметка виртуального портфеля",
                )
            )
        else:
            row.value = value
        await session.flush()

    async def backfill_from_history_if_needed(self, session: AsyncSession) -> None:
        done = await self._get_setting_str(session, _BACKFILL_SETTING_KEY)
        if done == "true":
            return

        stmt = (
            select(TradingRequest)
            .where(TradingRequest.mode == "paper", TradingRequest.status == "EXECUTED")
            .order_by(TradingRequest.created_at.asc())
        )
        orders = list((await session.scalars(stmt)).all())
        if not orders:
            await self._set_setting_str(session, _BACKFILL_SETTING_KEY, "true")
            return

        initial = await self._read_initial_capital_decimal(session)
        cash_f = float(initial)
        row = await self.get_or_create_snapshot(session, profile_slug="moderate")
        row.cash = cash_f
        row.positions = {}
        row.trades = []
        row.initial_capital = cash_f
        row.version = 1
        await session.flush()

        for req in orders:
            await self.apply_paper_execution(
                session,
                req,
                actual_price=req.actual_price,
                actual_amount=req.actual_amount,
            )

        await self._set_setting_str(session, _BACKFILL_SETTING_KEY, "true")
