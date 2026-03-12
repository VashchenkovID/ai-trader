"""API предварительной проверки готовности."""

from fastapi import APIRouter, Depends

from app.api.deps import get_container
from app.schemas.envelope import SuccessEnvelope
from app.services.container import AppContainer

router = APIRouter(prefix="/preflight-check", tags=["preflight-check"])


@router.post("/run", summary="Запустить проверку готовности")
async def preflight_run(
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    """Выполняет комплексную проверку готовности к торговле."""
    result = container.preflight_service.run_checks()
    passed = result.get("overallStatus") == "passed"
    checks_list = [
        {"name": k, "passed": v.get("status") == "ok", "message": str(v)}
        for k, v in result.get("checks", {}).items()
    ]
    return SuccessEnvelope(
        data={
            "passed": passed,
            "results": result,
            "checks": checks_list,
        }
    )


@router.get("/status", summary="Статус последней проверки")
async def preflight_status(
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    """Возвращает статус последней выполненной проверки."""
    data = container.preflight_service.get_status()
    return SuccessEnvelope(data=data)


@router.get("/results", summary="Результаты проверки")
async def preflight_results(
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    """Возвращает полные результаты последней проверки."""
    data = container.preflight_service.get_results()
    return SuccessEnvelope(data=data)
