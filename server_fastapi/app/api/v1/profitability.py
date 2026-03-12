from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_container
from app.db.session import get_db_session
from app.schemas.envelope import SuccessEnvelope
from app.services.container import AppContainer

router = APIRouter(prefix="/profitability", tags=["profitability"])


@router.get("/status", summary="Статус блока прибыльности")
async def profitability_status(
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, object]]:
    """Возвращает состояние трекера прибыльности."""
    return SuccessEnvelope(data=await container.profitability_service.get_status(db_session))


@router.get("/analysis", summary="Агрегированный анализ прибыльности")
async def profitability_analysis(
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, object]]:
    """Возвращает агрегированный анализ прибыльности."""
    return SuccessEnvelope(data=await container.profitability_service.get_analysis(db_session))


@router.get("/report", summary="Отчет по прибыльности")
async def profitability_report(
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, object]]:
    """Возвращает отчет о прибыльности для UI."""
    return SuccessEnvelope(data=await container.profitability_service.get_report(db_session))
