from fastapi import APIRouter

from app.core.time_utils import now_msk
from app.schemas.envelope import SuccessEnvelope
from app.schemas.health import HealthDTO

router = APIRouter(tags=["health"])


@router.get("/health", summary="Проверка здоровья API (v1)")
async def health_v1() -> SuccessEnvelope[HealthDTO]:
    health = HealthDTO(
        status="ok",
        service="ai-trader-fastapi",
        timestamp=now_msk(),
    )
    return SuccessEnvelope(data=health)
