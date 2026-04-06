"""Виртуальный (paper) портфель: снимок в БД, обновление при исполнении заявок."""

from __future__ import annotations

import contextlib
from decimal import Decimal
from typing import Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_utils import now_msk
from app.db.models import AppSetting, TradingRequest, VirtualPortfolio
from app.repositories.market_repository import MarketRepository
from app.repositories.virtual_portfolio_repository import VirtualPortfolioRepository

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

    async def get_or_create_snapshot(self, session: AsyncSession) -> VirtualPortfolio:
        row = await self._repo.get_singleton(session)
        if row is not None:
            return row
        initial = await self._read_initial_capital_decimal(session)
        cash_f = float(initial)
        now = now_msk()
        row = VirtualPortfolio(
            id=1,
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
        row = await self._repo.get_singleton(session)
        if row is not None:
            return
        await self.get_or_create_snapshot(session)

    async def get_available_cash_for_sizing(self, session: AsyncSession) -> Decimal | None:
        """Свободный cash для расчёта размера BUY; None если строки ещё нет."""
        row = await self._repo.get_singleton(session)
        if row is None:
            return None
        return Decimal(str(row.cash)) if row.cash is not None else Decimal("0")

    async def get_position_quantity(self, session: AsyncSession, figi: str) -> int:
        """Количество бумаг по FIGI в виртуальном портфеле (0, если строки или позиции нет)."""
        row = await self._repo.get_singleton(session)
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
        row = await self.get_or_create_snapshot(session)
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

    async def get_portfolio_payload(self, session: AsyncSession) -> dict[str, Any]:
        row = await self.get_or_create_snapshot(session)
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
            positions_list.append(
                {
                    "figi": str(figi),
                    "quantity": qty_num,
                    "ticker": ticker_out,
                    "name": name_out,
                    "currentPrice": lp,
                    "averagePositionPrice": avg_px,
                    "instrumentMissing": instrument_missing,
                }
            )
        return {
            "cash": row.cash,
            "positions": positions_map,
            "positionsList": positions_list,
            "totalValue": row.total_value,
            "positionsValue": row.positions_value,
            "initialCapital": row.initial_capital,
            "isVirtual": True,
        }

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
        row = await self.get_or_create_snapshot(session)
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
