from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_container
from app.db.session import get_db_session
from app.schemas.envelope import SuccessEnvelope
from app.services.container import AppContainer

router = APIRouter(prefix="/news", tags=["news"])


@router.get("/status", summary="Статус новостного контура")
async def news_status(
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, object]]:
    """Возвращает состояние новостного контура."""
    return SuccessEnvelope(data=await container.news_service.get_status(db_session))


@router.get("/instruments", summary="Инструменты для новостной выборки")
async def news_instruments(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=1000),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, object]]:
    """Возвращает инструменты, доступные для новостной выборки."""
    items, total = await container.news_service.get_instruments(
        db_session,
        offset=offset,
        limit=limit,
    )
    return SuccessEnvelope(data={"items": items, "meta": {"offset": offset, "limit": limit, "total": total}})


@router.get("/{figi}", summary="Новости по FIGI")
async def news_by_figi(
    figi: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=200),
    days: int = Query(default=30, ge=1, le=3650),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, object]]:
    """Возвращает новости по FIGI и метаданные запроса."""
    items, total = await container.news_service.get_news(
        db_session=db_session,
        figi=figi,
        offset=offset,
        limit=limit,
        days=days,
    )
    return SuccessEnvelope(
        data={
            "items": items,
            "meta": {
                "figi": figi,
                "requestedDays": days,
                "offset": offset,
                "limit": limit,
                "total": total,
                "fallbackUsed": False,
            },
        }
    )
