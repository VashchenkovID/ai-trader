import asyncio
from decimal import Decimal
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Recommendation
from app.repositories.market_repository import MarketRepository
from app.services.weekly_forecast_service import run_weekly_forecast_sync

_WEEKLY_REFRESH_SEMAPHORE = asyncio.Semaphore(2)


class MarketService:
    """Сервис read-операций рыночного домена через явный repository слой."""

    def __init__(self, repository: MarketRepository) -> None:
        self._repository = repository

    @staticmethod
    def _to_float(value: object) -> float | None:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, Decimal):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                return None
        return None

    def _build_trade_plan(
        self, recommendation: str, current_price: float | None, llm_payload: dict | None
    ) -> dict[str, object]:
        if current_price is None or current_price <= 0:
            return {
                "status": "insufficient_data",
                "statusReason": "last_price_unavailable",
                "entryPrice": None,
                "stopLoss": None,
                "takeProfit": None,
                "riskReward": None,
                "horizon": "1w",
                "positionRiskPct": 0.0,
                "invalidationCondition": "Нет цены инструмента для расчета торгового плана.",
            }

        llm_payload = llm_payload or {}
        entry = self._to_float(llm_payload.get("entryPrice") or llm_payload.get("entry_price")) or current_price
        stop = self._to_float(llm_payload.get("stopLoss") or llm_payload.get("stop_loss"))
        take = self._to_float(llm_payload.get("takeProfit") or llm_payload.get("take_profit"))
        risk_reward = self._to_float(llm_payload.get("riskReward") or llm_payload.get("risk_reward"))

        if recommendation == "BUY":
            stop = stop or round(entry * 0.98, 6)
            take = take or round(entry * 1.04, 6)
        elif recommendation == "SELL":
            stop = stop or round(entry * 1.02, 6)
            take = take or round(entry * 0.96, 6)
        else:
            stop = stop or round(entry * 0.99, 6)
            take = take or round(entry * 1.01, 6)

        if risk_reward is None:
            risk = abs(entry - stop)
            reward = abs(take - entry)
            risk_reward = round(reward / risk, 3) if risk > 0 else None

        if recommendation == "BUY":
            invalidation = f"Отмена идеи: падение ниже {stop:.3f}"
        elif recommendation == "SELL":
            invalidation = f"Отмена идеи: рост выше {stop:.3f}"
        else:
            invalidation = "Отмена идеи: уход цены из нейтрального диапазона."

        return {
            "status": "ready",
            "statusReason": None,
            "entryPrice": round(entry, 6),
            "stopLoss": round(stop, 6),
            "takeProfit": round(take, 6),
            "riskReward": risk_reward,
            "horizon": "1w",
            "positionRiskPct": 0.01,
            "invalidationCondition": invalidation,
        }

    def _build_explain_summary(
        self,
        recommendation: str,
        confidence: float | None,
        llm_payload: dict | None,
        nn_payload: dict | None,
    ) -> dict[str, object]:
        llm_payload = llm_payload or {}
        nn_payload = nn_payload or {}
        mode = str(llm_payload.get("mode") or "unknown")
        regime = str(llm_payload.get("marketRegime") or nn_payload.get("marketRegime") or "unknown")
        llm_reason = str(llm_payload.get("llmReason") or "")
        regime_human = {
            "normal": "стабильный рынок",
            "volatile": "повышенная волатильность",
            "trend_up": "восходящий тренд",
            "trend_down": "нисходящий тренд",
            "unknown": "данные о режиме отсутствуют",
        }.get(regime, regime)
        llm_reason_human = {
            "skipped_confident_nn": "LLM не вызывался: уверенный сигнал нейросети.",
            "ok": "LLM-сигнал успешно учтен в итоговом решении.",
            "cache_hit": "Использован кэшированный результат LLM.",
        }.get(llm_reason, llm_reason)

        if mode == "nn_only":
            mode_human = "Решение NN без вызова LLM"
        elif mode == "nn_llm":
            mode_human = "Совмещенный сигнал NN+LLM"
        elif mode == "llm_only":
            mode_human = "Решение LLM без NN"
        else:
            mode_human = "Режим решения не определен"

        confidence_pct = f"{round(confidence * 100)}%" if confidence is not None else "не указана"
        summary = (
            f"{recommendation}: {mode_human}. Рыночный режим: {regime_human}. "
            f"Уверенность: {confidence_pct}."
        )
        if llm_reason_human:
            summary += f" Комментарий LLM: {llm_reason_human}"

        return {
            "summary": summary,
            "modelDecision": mode,
            "marketRegime": regime_human,
            "whyNoLlm": llm_reason_human if mode == "nn_only" else None,
            "dataFreshnessSec": None,
        }

    @staticmethod
    def _extract_horizon_momentum(nn_payload: object) -> list[dict[str, object]]:
        """Доходности за 1/5/20 дней из признаков NN (факт по истории, не forward-прогноз LSTM)."""
        if not isinstance(nn_payload, dict):
            return []
        cols = nn_payload.get("featureColumns") or nn_payload.get("feature_columns")
        vals = nn_payload.get("featureValues") or nn_payload.get("feature_values")
        if not isinstance(cols, list) or not isinstance(vals, list) or len(cols) != len(vals):
            return []
        by_col: dict[str, float] = {}
        for key, raw in zip(cols, vals):
            f = MarketService._to_float(raw)
            if f is not None:
                by_col[str(key)] = f
        mapping = (
            ("ret1", "1d", "1 день"),
            ("ret5", "5d", "5 дней"),
            ("ret20", "20d", "~20 дней"),
        )
        out: list[dict[str, object]] = []
        for feat_key, hid, label in mapping:
            if feat_key not in by_col:
                continue
            ret = by_col[feat_key]
            out.append(
                {
                    "id": hid,
                    "label": label,
                    "returnPct": round(ret * 100.0, 4),
                    "kind": "past_return",
                }
            )
        return out

    def _recommendation_row_to_payload(
        self,
        row: Recommendation,
        ticker: str | None,
        name: str | None,
        last_price: object | None,
    ) -> dict[str, object]:
        llm_payload = getattr(row, "llm_jury_payload", None)
        nn_payload = getattr(row, "nn_payload", None)
        confidence = self._to_float(getattr(row, "confidence", None))
        current_price = self._to_float(last_price)
        trade_plan = self._build_trade_plan(row.recommendation, current_price, llm_payload)
        explain = self._build_explain_summary(row.recommendation, confidence, llm_payload, nn_payload)
        horizon_momentum = self._extract_horizon_momentum(nn_payload)
        return {
            "id": str(getattr(row, "id", "") or ""),
            "figi": row.figi,
            "ticker": ticker,
            "name": name,
            "recommendation": row.recommendation,
            "confidence": row.confidence,
            "score": row.score,
            "paperRecommendation": getattr(row, "paper_recommendation", None),
            "paperConfidence": getattr(row, "paper_confidence", None),
            "paperScore": getattr(row, "paper_score", None),
            "analysisDate": row.analysis_date,
            "lastPrice": last_price,
            "llmJuryPayload": llm_payload,
            "nnScore": getattr(row, "nn_score", None),
            "nnConfidence": getattr(row, "nn_confidence", None),
            "nnCheckpoint": getattr(row, "nn_checkpoint", None),
            "nnPayload": nn_payload,
            "horizonMomentum": horizon_momentum,
            "tradePlan": trade_plan,
            "explain": explain,
            "weeklyForecast": getattr(row, "weekly_forecast", None),
            "weeklyForecastAt": getattr(row, "weekly_forecast_at", None),
        }

    async def get_instruments(
        self,
        db_session: AsyncSession,
        *,
        offset: int = 0,
        limit: int = 200,
    ) -> tuple[list[dict[str, object]], int]:
        try:
            items = await self._repository.list_instruments(db_session, offset=offset, limit=limit)
            total = await self._repository.count_instruments(db_session)
        except Exception:
            return [], 0
        payload = [
            {
                "figi": item.figi,
                "ticker": item.ticker,
                "name": item.name,
                "sector": item.sector,
                "currency": item.currency,
                "lastPrice": item.last_price,
            }
            for item in items
        ]
        return payload, total

    async def get_recommendations(
        self,
        db_session: AsyncSession,
        *,
        offset: int = 0,
        limit: int = 200,
    ) -> tuple[list[dict[str, object]], int]:
        try:
            rows = await self._repository.list_recommendations_with_instrument(
                db_session, offset=offset, limit=limit
            )
            total = await self._repository.count_recommendations(db_session)
        except Exception:
            return [], 0
        payload = []
        for item in rows:
            row = item[0]
            ticker = item[1] if len(item) > 1 else None
            name = item[2] if len(item) > 2 else None
            last_price = item[3] if len(item) > 3 else None
            payload.append(self._recommendation_row_to_payload(row, ticker, name, last_price))
        return payload, total

    async def get_recommendation_for_figi(
        self, db_session: AsyncSession, figi: str
    ) -> dict[str, object] | None:
        try:
            row = await self._repository.get_recommendation_by_figi(db_session, figi)
            if row is None:
                return None
            inst = await self._repository.get_instrument_by_figi(db_session, figi)
            ticker = inst.ticker if inst else None
            name = inst.name if inst else None
            last_price = inst.last_price if inst else None
            return self._recommendation_row_to_payload(row, ticker, name, last_price)
        except Exception:
            return None

    async def get_recommendations_for_figis(
        self, db_session: AsyncSession, figis: list[str]
    ) -> list[dict[str, object]]:
        """Пакетно: последняя рекомендация по каждому FIGI (для таблицы портфеля)."""
        try:
            rows = await self._repository.get_latest_recommendations_for_figis(db_session, figis)
        except Exception:
            return []
        out: list[dict[str, object]] = []
        for row in rows:
            inst = await self._repository.get_instrument_by_figi(db_session, row.figi)
            ticker = inst.ticker if inst else None
            name = inst.name if inst else None
            last_price = inst.last_price if inst else None
            out.append(self._recommendation_row_to_payload(row, ticker, name, last_price))
        return out

    async def get_analyst_signals_for_figi(
        self, db_session: AsyncSession, figi: str
    ) -> list[dict[str, object]]:
        try:
            inst = await self._repository.get_instrument_by_figi(db_session, figi)
            ticker = inst.ticker if inst else None
            rows = await self._repository.list_signals_by_figi(
                db_session, figi=figi, ticker=ticker, limit=100
            )
        except Exception:
            return []
        out: list[dict[str, object]] = []
        for r in rows:
            out.append(
                {
                    "signalUid": r.signal_uid,
                    "figi": r.figi,
                    "ticker": r.ticker,
                    "direction": r.direction,
                    "syncedAt": r.synced_at,
                    "payload": r.raw_payload,
                }
            )
        return out

    async def compute_and_store_weekly_forecast(self, db_session: AsyncSession, figi: str) -> dict[str, object]:
        """Инференс Weekly LSTM и запись в строку рекомендации (без кэша in-memory)."""
        try:
            from training.config import get_training_settings

            models_root = Path(get_training_settings().models_root).resolve()
        except Exception:
            models_root = Path("./models").resolve()
        try:
            candles, total = await self.get_candles(db_session, figi, offset=0, limit=500)
        except Exception:
            err: dict[str, object] = {"ok": False, "reason": "candles_error"}
            await self._repository.update_recommendation_weekly_forecast(db_session, figi=figi, payload=err)
            return err
        if total < 55:
            err = {"ok": False, "reason": "insufficient_candles", "totalCandles": total}
            await self._repository.update_recommendation_weekly_forecast(db_session, figi=figi, payload=err)
            return err
        candle_payload: list[dict[str, object]] = []
        for c in candles:
            candle_payload.append(
                {
                    "time": c["time"],
                    "close": float(c["close"]) if c.get("close") is not None else 0.0,
                    "volume": int(c["volume"] or 0),
                }
            )

        def _run() -> dict[str, object]:
            return run_weekly_forecast_sync(candle_payload, models_root=models_root, cache_key=None)

        try:
            result = await asyncio.to_thread(_run)
        except Exception as e:
            result = {"ok": False, "reason": "inference_error", "detail": str(e)}
        await self._repository.update_recommendation_weekly_forecast(
            db_session, figi=figi, payload=dict(result)
        )
        return dict(result)

    async def get_weekly_forecast_for_figi(
        self, db_session: AsyncSession, figi: str, *, refresh: bool = False
    ) -> dict[str, object]:
        """
        По умолчанию — чтение из БД (сохраняется при расчёте рекомендации в scheduler).
        При refresh=true — повторный инференс с ограничением параллелизма (семафор).
        """
        try:
            row = await self._repository.get_recommendation_by_figi(db_session, figi)
        except Exception:
            return {"ok": False, "reason": "db_error"}
        if row is None:
            return {"ok": False, "reason": "no_recommendation"}
        stored = getattr(row, "weekly_forecast", None)
        if not refresh and isinstance(stored, dict) and stored.get("ok") is not None:
            out = dict(stored)
            out["source"] = "database"
            out["recommendationId"] = str(row.id)
            out["weeklyForecastAt"] = row.weekly_forecast_at
            return out
        if not refresh:
            return {
                "ok": False,
                "reason": "not_stored",
                "hint": "Запустите анализ портфеля (scheduler) или запросите с refresh=1.",
            }
        async with _WEEKLY_REFRESH_SEMAPHORE:
            await self.compute_and_store_weekly_forecast(db_session, figi)
        row_after = await self._repository.get_recommendation_by_figi(db_session, figi)
        if row_after is None or row_after.weekly_forecast is None:
            return {"ok": False, "reason": "store_failed"}
        out = dict(row_after.weekly_forecast)
        out["source"] = "refresh"
        out["recommendationId"] = str(row_after.id)
        out["weeklyForecastAt"] = row_after.weekly_forecast_at
        return out

    async def get_stock(self, db_session: AsyncSession, figi: str) -> dict[str, object] | None:
        try:
            row = await self._repository.get_instrument_by_figi(db_session, figi)
        except Exception:
            return None
        if row is None:
            return None
        payload = {
            "figi": row.figi,
            "ticker": row.ticker,
            "name": row.name,
            "sector": row.sector,
            "currency": row.currency,
            "currentPrice": row.last_price,
            "lastPrice": row.last_price,
            "lot": row.lot,
        }
        payload["dividendYield"] = None
        payload["lastPriceTime"] = None
        return payload

    async def get_candles(
        self,
        db_session: AsyncSession,
        figi: str,
        offset: int = 0,
        limit: int = 30,
    ) -> tuple[list[dict[str, object]], int]:
        try:
            rows = await self._repository.get_candles_by_figi(
                db_session,
                figi=figi,
                offset=offset,
                limit=limit,
            )
            total = await self._repository.count_candles_by_figi(db_session, figi=figi)
        except Exception:
            return [], 0
        payload = [
            {
                "time": row.candle_time,
                "open": row.open,
                "high": row.high,
                "low": row.low,
                "close": row.close,
                "volume": row.volume,
            }
            for row in rows
        ]
        return payload, total
