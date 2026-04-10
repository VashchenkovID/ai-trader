from fastapi import APIRouter

from app.core.time_utils import now_msk
from app.schemas.envelope import SuccessEnvelope
from app.schemas.health import HealthDTO

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    summary="Проверка здоровья API (v1)",
    description="Тот же контракт SuccessEnvelope[HealthDTO], что GET /health на корне; путь под префиксом /api/v1 для клиентов, привязанных к версии API.",
)
async def health_v1() -> SuccessEnvelope[HealthDTO]:
    health = HealthDTO(
        status="ok",
        service="ai-trader-fastapi",
        timestamp=now_msk(),
    )
    return SuccessEnvelope(data=health)
