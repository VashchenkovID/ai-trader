from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_container
from app.db.session import get_db_session
from app.schemas.envelope import SuccessEnvelope
from app.services.container import AppContainer

router = APIRouter(prefix="/performance", tags=["performance"])


@router.get("/sector-analysis", summary="Анализ по секторам")
async def performance_sector_analysis(
    days: int = Query(default=30, ge=1, le=3650),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=1000),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, object]]:
    """Возвращает доходность по секторам за период."""
    items, total = await container.performance_service.get_sector_analysis(
        db_session,
        days=days,
        offset=offset,
        limit=limit,
    )
    return SuccessEnvelope(data={"items": items, "meta": {"offset": offset, "limit": limit, "total": total}})


@router.get("/visualization/dashboard", summary="Данные для дашборда производительности")
async def performance_dashboard(
    period: int = Query(default=30, ge=1, le=3650),
    strategy: str | None = Query(default=None),
    sector: str | None = Query(default=None),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, object]]:
    """Возвращает агрегированные данные дашборда."""
    return SuccessEnvelope(
        data=await container.performance_service.get_dashboard(
            db_session=db_session,
            period=period,
            strategy=strategy,
            sector=sector,
        )
    )


@router.get("/benchmark/list", summary="Список бенчмарков")
async def performance_benchmark_list(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=1000),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, object]]:
    """Возвращает список доступных бенчмарков."""
    items, total = await container.performance_service.get_benchmark_list(
        db_session,
        offset=offset,
        limit=limit,
    )
    return SuccessEnvelope(data={"items": items, "meta": {"offset": offset, "limit": limit, "total": total}})


@router.get("/sectors", summary="Список секторов")
async def performance_sectors(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=1000),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, object]]:
    """Возвращает список секторов для фильтров аналитики."""
    items, total = await container.performance_service.get_sectors(
        db_session,
        offset=offset,
        limit=limit,
    )
    return SuccessEnvelope(data={"items": items, "meta": {"offset": offset, "limit": limit, "total": total}})
