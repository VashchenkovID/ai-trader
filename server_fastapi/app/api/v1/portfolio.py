"""
Эндпоинты портфеля (реальный счёт Tinkoff). Фаза 5.
Контракт совместим с фронтом: cash, positions, totalValue, positionsValue.
"""

import asyncio

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_container
from app.db.models import RealPortfolio
from app.db.session import get_db_session
from app.core.errors import AppError
from app.schemas.envelope import SuccessEnvelope
from app.scheduler import list_tasks, trigger_named_job
from app.core.virtual_profiles import VIRTUAL_PROFILE_SLUGS, normalize_virtual_profile
from app.services.container import AppContainer
from app.services.tinkoff_client import price_units_nano_to_float
from app.services.tinkoff_portfolio_helpers import (
    merge_rub_cash,
    positions_value_rub_excluding_cash,
    total_rub_cash_from_positions,
    without_rub_cash_positions,
)

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def _positions_value(positions: list[dict]) -> float:
    """Сумма стоимости бумаг (без рублёвой позиции-кэша RUB000UTSTOM)."""
    return positions_value_rub_excluding_cash(positions)


@router.get("", summary="Портфель (реальный счёт Tinkoff)")
@router.get("/", summary="Портфель (реальный счёт Tinkoff)")
async def get_portfolio(
    db_session: AsyncSession = Depends(get_db_session),
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
    rub_from_cash_figi = total_rub_cash_from_positions(positions)
    positions_trading = without_rub_cash_positions(positions)
    positions_value = _positions_value(positions_trading)
    money = positions_data.get("money") or []
    cash_from_money = 0.0
    for m in money:
        cur = (m or {}).get("currency", "RUB")
        if cur == "RUB":
            v = (m or {}).get("value", 0)
            cash_from_money += float(v) if not isinstance(v, dict) else price_units_nano_to_float(v)
    cash = merge_rub_cash(cash_from_money, rub_from_cash_figi)
    total_value = total_amount if total_amount > 0 else (cash + positions_value)
    positions_map = {p.get("figi", ""): p.get("quantity", 0) for p in positions_trading if p.get("figi")}
    figis = [str(p.get("figi")) for p in positions_trading if p.get("figi")]
    price_by_figi = await container.market_repository.map_last_prices_by_figis(db_session, figis)
    for p in positions_trading:
        if not isinstance(p, dict):
            continue
        figi = p.get("figi")
        if not figi:
            continue
        lp = price_by_figi.get(str(figi))
        if lp is not None:
            p["instrumentLastPrice"] = float(lp)
    return SuccessEnvelope(
        data={
            "cash": cash,
            "positions": positions_map,
            "totalValue": total_value,
            "positionsValue": positions_value,
            "positionsList": positions_trading,
        }
    )


@router.get(
    "/real/db",
    summary="Снимок реального портфеля из БД (после scheduler / portfolio sync)",
)
async def get_real_portfolio_db_snapshot(
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    """
    Данные из `real_portfolio` (id=1), записываемые задачей `_portfolio_sync_job`.
    Контракт рядом с live GET /portfolio: cash, positions, totalValue, positionsValue + meta.
    """
    row = await db_session.scalar(select(RealPortfolio).where(RealPortfolio.id == 1).limit(1))
    await db_session.commit()
    if row is None:
        return SuccessEnvelope(
            data={
                "cached": False,
                "cash": 0.0,
                "positions": {},
                "totalValue": 0.0,
                "positionsValue": 0.0,
                "lastUpdated": None,
                "initialCapital": None,
                "version": None,
            }
        )
    return SuccessEnvelope(
        data={
            "cached": True,
            "cash": float(row.cash),
            "positions": dict(row.positions or {}),
            "totalValue": float(row.total_value),
            "positionsValue": float(row.positions_value),
            "lastUpdated": row.last_updated,
            "initialCapital": row.initial_capital,
            "version": row.version,
        }
    )


@router.get(
    "/position-recommendations",
    summary="Рекомендации по FIGI позиций портфеля (пакетно из БД)",
)
async def get_portfolio_position_recommendations(
    db_session: AsyncSession = Depends(get_db_session),
    container: AppContainer = Depends(get_container),
    figi: list[str] = Query(
        default=[],
        description="Повторяющийся query-параметр: figi=TCS123&figi=...",
    ),
) -> SuccessEnvelope[dict]:
    """Последние рекомендации (BUY/SELL/HOLD) по списку FIGI — для таблицы на странице портфеля."""
    max_n = 100
    clean = [f.strip() for f in figi if f and str(f).strip()][:max_n]
    items = await container.market_service.get_recommendations_for_figis(db_session, clean)
    await db_session.commit()
    return SuccessEnvelope(data={"items": items, "meta": {"requested": len(clean), "returned": len(items)}})


@router.get("/virtual", summary="Виртуальный портфель (paper, из БД)")
async def get_virtual_portfolio(
    profile: str | None = Query(
        default=None,
        description="Профиль: conservative|moderate|aggressive|experimental (по умолчанию moderate)",
    ),
    include_trades: bool = Query(
        default=False,
        description="Добавить последние сделки в ответ (до 200 записей)",
    ),
    db_session: AsyncSession = Depends(get_db_session),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    """Снимок виртуального портфеля: тот же контракт, что у реального таба + isVirtual."""
    data = await container.virtual_portfolio_service.get_portfolio_payload(
        db_session, profile_slug=profile, include_trades=include_trades
    )
    await db_session.commit()
    return SuccessEnvelope(data=data)


@router.get(
    "/virtual/detail",
    summary="Виртуальный портфель с сделками (alias include_trades=true)",
)
async def get_virtual_portfolio_detail(
    profile: str | None = Query(
        default=None,
        description="Профиль: conservative|moderate|aggressive|experimental",
    ),
    db_session: AsyncSession = Depends(get_db_session),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    data = await container.virtual_portfolio_service.get_portfolio_payload(
        db_session, profile_slug=profile, include_trades=True
    )
    await db_session.commit()
    return SuccessEnvelope(data=data)


@router.get("/virtual/nav-history", summary="История NAV по профилю (для графиков)")
async def get_virtual_nav_history(
    profile: str | None = Query(default=None, description="slug профиля"),
    limit_days: int = Query(default=120, ge=7, le=400),
    db_session: AsyncSession = Depends(get_db_session),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    slug = normalize_virtual_profile(profile)
    pts = await container.virtual_portfolio_service.load_nav_points(
        db_session, slug, limit_days=limit_days
    )
    await db_session.commit()
    series = [{"date": str(d), "totalValue": v} for d, v in pts]
    return SuccessEnvelope(data={"profileSlug": slug, "points": series})


@router.get("/virtual/profiles", summary="Сводка по всем виртуальным профилям")
async def get_virtual_portfolio_profiles(
    db_session: AsyncSession = Depends(get_db_session),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    """Карточки для дашборда: conservative / moderate / aggressive / experimental."""
    items = await container.virtual_portfolio_service.list_all_profiles_payload(db_session)
    await db_session.commit()
    return SuccessEnvelope(data={"items": items})


@router.get("/virtual/profiles-config", summary="Эффективные пороги виртуальных профилей")
async def get_virtual_profiles_config(
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    """Зеркало `portfolio.profiles` после merge с дефолтами (для UI / GitOps)."""
    items = {
        slug: container.portfolio_profile_config_service.get_config(slug).model_dump()
        for slug in VIRTUAL_PROFILE_SLUGS
    }
    return SuccessEnvelope(data={"items": items})


@router.get(
    "/sync",
    summary="Снимок портфеля (live), без фоновой задачи",
    description="Те же данные, что GET /portfolio: немедленное чтение из Tinkoff. Не путать с POST /portfolio/sync.",
)
async def portfolio_sync(
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    return await get_portfolio(container=container)


@router.post(
    "/real/sync",
    summary="Поставить в очередь фоновую синхронизацию реального портфеля",
    description="Триггер named job `portfolio_real_sync` (запись снимка в БД и т.п.).",
)
async def real_portfolio_sync_trigger() -> SuccessEnvelope[dict[str, object]]:
    return SuccessEnvelope(data=trigger_named_job("portfolio_real_sync"))


@router.post(
    "/sync",
    summary="Поставить в очередь фоновую синхронизацию портфеля",
    description="Триггер named job `portfolio_sync`. Не возвращает позиции — для снимка используйте GET /portfolio или GET /portfolio/sync.",
)
async def portfolio_sync_trigger() -> SuccessEnvelope[dict[str, object]]:
    return SuccessEnvelope(data=trigger_named_job("portfolio_sync"))


@router.get(
    "/sync/status",
    summary="Статус последних задач синхронизации портфеля",
    description="Последние задачи типов portfolio_sync, portfolio_real_sync, tinkoff_portfolio_sync.",
)
async def portfolio_sync_status() -> SuccessEnvelope[dict[str, object]]:
    tasks = list_tasks(limit=200)
    candidates = [
        t for t in tasks if t.get("taskType") in {"portfolio_sync", "portfolio_real_sync", "tinkoff_portfolio_sync"}
    ]
    latest = candidates[0] if candidates else None
    return SuccessEnvelope(data={"lastTask": latest, "hasActiveSync": any(t.get("status") == "running" for t in candidates)})
