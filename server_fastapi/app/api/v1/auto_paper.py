from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_container
from app.db.session import get_db_session
from app.schemas.envelope import SuccessEnvelope
from app.services.container import AppContainer

router = APIRouter(prefix="/auto-paper-trading", tags=["auto-paper-trading"])


@router.get("/status", summary="Статус автоматической торговли")
async def auto_paper_status(
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    """Возвращает статус auto-paper: enabled, tradingMode."""
    data = container.auto_paper_service.get_status()
    return SuccessEnvelope(data=data)


@router.post("/enable", summary="Включить автоторговлю")
async def auto_paper_enable(
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    """Включает автоторговлю. Разрешено только в режиме paper."""
    container.auto_paper_service.enable()
    return SuccessEnvelope(data={"message": "Автоторговля включена"})


@router.post("/disable", summary="Выключить автоторговлю")
async def auto_paper_disable(
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    """Выключает автоторговлю."""
    container.auto_paper_service.disable()
    return SuccessEnvelope(data={"message": "Автоторговля выключена"})


@router.get("/can-execute/{request_id}", summary="Проверка возможности автоисполнения")
async def auto_paper_can_execute(
    request_id: UUID = Path(..., description="ID заявки"),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    """Проверяет, можно ли автоматически исполнить заявку (paper, enabled, PENDING, risk OK)."""
    data = await container.auto_paper_service.can_auto_execute(db_session, request_id)
    return SuccessEnvelope(data=data)


@router.post("/execute/{request_id}", summary="Автоисполнение заявки")
async def auto_paper_execute(
    request_id: UUID = Path(..., description="ID заявки"),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    """Approve + Execute для PENDING заявки (только paper, auto-paper enabled)."""
    data = await container.auto_paper_service.auto_execute_request(db_session, request_id)
    await db_session.commit()
    return SuccessEnvelope(data=data)


@router.get("/stats", summary="Статистика автоторговли")
async def auto_paper_stats(
    startDate: date | None = Query(default=None, description="Начало периода"),
    endDate: date | None = Query(default=None, description="Конец периода"),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    """Возвращает статистику исполненных заявок в paper-режиме."""
    data = await container.auto_paper_service.get_stats(
        db_session, start_date=startDate, end_date=endDate
    )
    return SuccessEnvelope(data=data)
