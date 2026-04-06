from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_container
from app.core.errors import AppError
from app.db.session import get_db_session
from app.schemas.envelope import SuccessEnvelope
from app.schemas.trading import (
    TradingRequestApproveRequest,
    TradingRequestCreateRequest,
    TradingRequestExecuteRequest,
    TradingRequestPreviewRequest,
    TradingRequestRejectRequest,
)
from app.services.container import AppContainer

router = APIRouter(prefix="/trading-requests", tags=["trading-requests"])


@router.get("", summary="Список торговых заявок")
async def trading_requests_list(
    status: str | None = Query(default=None, description="Фильтр по статусу"),
    mode: str | None = Query(default=None, description="Фильтр по режиму"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    """Возвращает список торговых заявок с пагинацией."""
    items, total = await container.trading_request_service.get_requests(
        db_session, status=status, mode=mode, offset=offset, limit=limit
    )
    return SuccessEnvelope(data={"items": items, "meta": {"offset": offset, "limit": limit, "total": total}})


@router.get("/pending", summary="Ожидающие заявки")
async def trading_requests_pending(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    """Возвращает заявки со статусом PENDING."""
    items, total = await container.trading_request_service.get_requests(
        db_session, status="PENDING", mode=None, offset=offset, limit=limit
    )
    return SuccessEnvelope(data={"items": items, "meta": {"offset": offset, "limit": limit, "total": total}})


@router.get("/approved", summary="Одобренные заявки")
async def trading_requests_approved(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    """Возвращает заявки со статусом APPROVED."""
    items, total = await container.trading_request_service.get_requests(
        db_session, status="APPROVED", mode=None, offset=offset, limit=limit
    )
    return SuccessEnvelope(data={"items": items, "meta": {"offset": offset, "limit": limit, "total": total}})


@router.post("/create", summary="Создать заявку")
async def trading_request_create(
    body: TradingRequestCreateRequest,
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    """Создает заявку из рекомендации (FIGI) или из переданных данных."""
    opts = body.options
    if body.recommendationFigi:
        data = await container.trading_request_service.create_from_recommendation(
            db_session,
            body.recommendationFigi,
            action=opts.action,
            mode=opts.mode,
            quantity=opts.quantity,
        )
    elif body.recommendationData:
        data = await container.trading_request_service.create_from_data(
            db_session,
            body.recommendationData,
            action=opts.action,
            mode=opts.mode,
            quantity=opts.quantity,
        )
    else:
        raise AppError("BAD_REQUEST", message="Требуется recommendationFigi или recommendationData")

    mode = (opts.mode or "paper").strip().lower()
    if mode == "paper":
        if (
            container.trading_mode_service.get_current_mode() == "paper"
            and container.auto_paper_service.get_status().get("enabled")
        ):
            raw_id = data.get("id")
            if raw_id is not None:
                try:
                    rid = raw_id if isinstance(raw_id, UUID) else UUID(str(raw_id))
                    data = await container.auto_paper_service.auto_execute_request(
                        db_session, rid
                    )
                except AppError:
                    pass

    await db_session.commit()
    return SuccessEnvelope(data=data)


@router.post("/preview", summary="Предрасчёт заявки (без записи)")
async def trading_request_preview(
    body: TradingRequestPreviewRequest,
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    """Возвращает количество, цену, бюджет и признак активной заявки по FIGI."""
    opts = body.options
    data = await container.trading_request_service.preview_trade(
        db_session,
        recommendation_figi=body.recommendationFigi,
        recommendation_data=body.recommendationData,
        action=opts.action,
        mode=opts.mode,
        quantity=opts.quantity,
    )
    return SuccessEnvelope(data=data)


@router.post("/{request_id}/approve", summary="Одобрить заявку")
async def trading_request_approve(
    request_id: UUID = Path(..., description="ID заявки"),
    body: TradingRequestApproveRequest | None = None,
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    """Переводит заявку из PENDING в APPROVED."""
    comment = body.comment if body else None
    data = await container.trading_request_service.approve(db_session, request_id, comment=comment)
    await db_session.commit()
    return SuccessEnvelope(data=data)


@router.post("/{request_id}/reject", summary="Отклонить заявку")
async def trading_request_reject(
    request_id: UUID = Path(..., description="ID заявки"),
    body: TradingRequestRejectRequest | None = None,
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    """Переводит заявку из PENDING в REJECTED."""
    reason = body.reason if body else ""
    data = await container.trading_request_service.reject(db_session, request_id, reason=reason)
    await db_session.commit()
    return SuccessEnvelope(data=data)


@router.post("/{request_id}/execute", summary="Исполнить заявку")
async def trading_request_execute(
    request_id: UUID = Path(..., description="ID заявки"),
    body: TradingRequestExecuteRequest | None = None,
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    """Переводит заявку из APPROVED в EXECUTED."""
    actual_price = body.actualPrice if body and body.actualPrice is not None else None
    actual_amount = body.actualAmount if body and body.actualAmount is not None else None
    data = await container.trading_request_service.execute(
        db_session, request_id, actual_price=actual_price, actual_amount=actual_amount
    )
    await db_session.commit()
    return SuccessEnvelope(data=data)


@router.post("/{request_id}/cancel", summary="Отменить заявку")
async def trading_request_cancel(
    request_id: UUID = Path(..., description="ID заявки"),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    """Отменяет заявку (PENDING или APPROVED)."""
    data = await container.trading_request_service.cancel(db_session, request_id)
    await db_session.commit()
    return SuccessEnvelope(data=data)


@router.get("/stats", summary="Статистика заявок")
async def trading_requests_stats(
    mode: str | None = Query(default=None, description="Фильтр по режиму"),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    """Возвращает агрегаты по статусам заявок."""
    data = await container.trading_request_service.get_stats(db_session, mode=mode)
    return SuccessEnvelope(data=data)


@router.post("/cleanup", summary="Очистить завершенные заявки")
async def trading_requests_cleanup(
    mode: str | None = Query(default=None, description="Фильтр по режиму (опционально)"),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    """Удаляет все заявки, которые не в статусе PENDING."""
    data = await container.trading_request_service.delete_completed(db_session, mode=mode)
    await db_session.commit()
    return SuccessEnvelope(data=data)
