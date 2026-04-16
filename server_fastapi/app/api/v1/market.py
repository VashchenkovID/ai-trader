from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_container
from app.core.errors import AppError
from app.db.session import get_db_session
from app.schemas.envelope import SuccessEnvelope
from app.scheduler import trigger_named_job
from app.services.container import AppContainer

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/instruments", summary="Список инструментов")
async def market_instruments(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=1000),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, object]]:
    """Возвращает список рыночных инструментов."""
    items, total = await container.market_service.get_instruments(db_session, offset=offset, limit=limit)
    return SuccessEnvelope(
        data={"items": items, "meta": {"offset": offset, "limit": limit, "total": total}}
    )


@router.get("/recommendations", summary="Список рекомендаций")
async def market_recommendations(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=1000),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, object]]:
    """Возвращает рекомендации по инструментам."""
    items, total = await container.market_service.get_recommendations(
        db_session, offset=offset, limit=limit
    )
    return SuccessEnvelope(
        data={"items": items, "meta": {"offset": offset, "limit": limit, "total": total}}
    )


@router.get("/recommendations/{figi}", summary="Рекомендация по FIGI")
async def market_recommendation_by_figi(
    figi: str,
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, object]]:
    """Последняя рекомендация по инструменту (тот же DTO, что в списке)."""
    item = await container.market_service.get_recommendation_for_figi(db_session, figi)
    if item is None:
        raise AppError("NOT_FOUND", message="Рекомендация не найдена")
    return SuccessEnvelope(data=item)


@router.get("/stock/{figi}", summary="Карточка инструмента по FIGI")
async def market_stock(
    figi: str,
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, object]]:
    """Возвращает детальную карточку инструмента."""
    stock = await container.market_service.get_stock(db_session, figi)
    if stock is None:
        raise AppError("NOT_FOUND", message="Инструмент не найден")
    return SuccessEnvelope(data=stock)


@router.get("/stock/{figi}/candles", summary="Свечи инструмента по FIGI")
async def market_stock_candles(
    figi: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=365, ge=1, le=3650),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, object]]:
    """Возвращает историю свечей для инструмента."""
    candles, total = await container.market_service.get_candles(
        db_session=db_session,
        figi=figi,
        offset=offset,
        limit=limit,
    )
    return SuccessEnvelope(
        data={"items": candles, "meta": {"offset": offset, "limit": limit, "total": total}}
    )


@router.get("/stock/{figi}/analyst-signals", summary="Сигналы аналитиков по FIGI")
async def market_stock_analyst_signals(
    figi: str,
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, object]]:
    """Сигналы из БД (синхронизация scheduler signals_update)."""
    items = await container.market_service.get_analyst_signals_for_figi(db_session, figi)
    return SuccessEnvelope(data={"items": items, "meta": {"figi": figi, "total": len(items)}})


@router.post("/refresh", summary="Фоновый refresh рыночных данных")
async def market_refresh() -> SuccessEnvelope[dict[str, object]]:
    return SuccessEnvelope(data=trigger_named_job("market_refresh"))
