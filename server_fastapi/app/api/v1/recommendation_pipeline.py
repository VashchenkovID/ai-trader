from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_container
from app.db.session import get_db_session
from app.schemas.envelope import SuccessEnvelope
from app.services.container import AppContainer

router = APIRouter(prefix="/recommendation-pipeline", tags=["recommendation-pipeline"])


@router.post("/run", summary="Запустить pipeline рекомендаций")
async def recommendation_pipeline_run(
    mode: str = Query(default="paper", description="Режим торговли"),
    minConfidence: float | None = Query(default=None, description="Минимальная уверенность (0-1)"),
    minScore: float | None = Query(default=None, description="Минимальный скоринг (0-1)"),
    limit: int = Query(default=50, ge=1, le=200),
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    """Обрабатывает рекомендации, проверяет пороги и дедупликацию, создает заявки."""
    min_conf = Decimal(str(minConfidence)) if minConfidence is not None else None
    min_scr = Decimal(str(minScore)) if minScore is not None else None
    data = await container.recommendation_pipeline_service.run(
        db_session,
        mode=mode,
        min_confidence=min_conf,
        min_score=min_scr,
        limit=limit,
    )
    if data.get("created"):
        await db_session.commit()
    return SuccessEnvelope(data=data)
