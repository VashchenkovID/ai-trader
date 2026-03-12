"""
Эндпоинты портфеля (реальный счёт Tinkoff). Фаза 5.
Контракт совместим с фронтом: cash, positions, totalValue, positionsValue.
"""

import asyncio

from fastapi import APIRouter, Depends

from app.api.deps import get_container
from app.core.errors import AppError
from app.schemas.envelope import SuccessEnvelope
from app.scheduler import list_tasks, trigger_named_job
from app.services.container import AppContainer
from app.services.tinkoff_client import price_units_nano_to_float

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def _positions_value(positions: list[dict]) -> float:
    """Сумма стоимости позиций (quantity * currentPrice)."""
    total = 0.0
    for p in positions:
        qty = p.get("quantity") or 0
        cur = p.get("currentPrice") or {}
        val = price_units_nano_to_float(cur) if isinstance(cur, dict) else float(cur or 0)
        total += qty * val
    return total


@router.get("", summary="Портфель (реальный счёт Tinkoff)")
@router.get("/", summary="Портфель (реальный счёт Tinkoff)")
async def get_portfolio(
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    """
    Возвращает данные реального портфеля из Tinkoff Invest API.
    Контракт: cash, positions, totalValue, positionsValue (совместим с performRealPortfolioSync).
    """
    client = container.tinkoff_client
    if not client:
        raise AppError(
            "SERVICE_UNAVAILABLE",
            message="Tinkoff API не настроен (отсутствует TINKOFF_TOKEN)",
        )
    portfolio = await asyncio.to_thread(client.get_portfolio)
    positions_data = await asyncio.to_thread(client.get_positions)
    positions = portfolio.get("positions") or positions_data.get("positions") or []
    total_amount = (portfolio.get("totalAmountPortfolio") or {}).get("value") or 0.0
    if isinstance(total_amount, dict):
        total_amount = price_units_nano_to_float(total_amount)
    positions_value = _positions_value(positions)
    money = positions_data.get("money") or []
    cash = 0.0
    for m in money:
        cur = (m or {}).get("currency", "RUB")
        if cur == "RUB":
            v = (m or {}).get("value", 0)
            cash += float(v) if not isinstance(v, dict) else price_units_nano_to_float(v)
    total_value = total_amount if total_amount > 0 else (cash + positions_value)
    positions_map = {p.get("figi", ""): p.get("quantity", 0) for p in positions if p.get("figi")}
    return SuccessEnvelope(
        data={
            "cash": cash,
            "positions": positions_map,
            "totalValue": total_value,
            "positionsValue": positions_value,
            "positionsList": positions,
        }
    )


@router.get("/sync", summary="Синхронизация портфеля (то же что GET /portfolio)")
async def portfolio_sync(
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    """Явный запрос синхронизации портфеля — те же данные, что GET /portfolio."""
    return await get_portfolio(container=container)


@router.post("/real/sync", summary="Фоновый sync реального портфеля из Tinkoff")
async def real_portfolio_sync_trigger() -> SuccessEnvelope[dict[str, object]]:
    return SuccessEnvelope(data=trigger_named_job("portfolio_real_sync"))


@router.post("/sync", summary="Фоновый sync портфеля")
async def portfolio_sync_trigger() -> SuccessEnvelope[dict[str, object]]:
    return SuccessEnvelope(data=trigger_named_job("portfolio_sync"))


@router.get("/sync/status", summary="Статус последнего sync портфеля")
async def portfolio_sync_status() -> SuccessEnvelope[dict[str, object]]:
    tasks = list_tasks(limit=200)
    candidates = [
        t for t in tasks if t.get("taskType") in {"portfolio_sync", "portfolio_real_sync", "tinkoff_portfolio_sync"}
    ]
    latest = candidates[0] if candidates else None
    return SuccessEnvelope(data={"lastTask": latest, "hasActiveSync": any(t.get("status") == "running" for t in candidates)})
