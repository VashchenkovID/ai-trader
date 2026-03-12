from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import get_container
from app.schemas.envelope import SuccessEnvelope
from app.services.container import AppContainer

router = APIRouter(prefix="/risk", tags=["risk"])


class RiskValidateRequest(BaseModel):
    figi: str = Field(..., description="FIGI инструмента")
    action: str = Field(..., description="BUY или SELL")
    quantity: int = Field(..., ge=1)
    price: Decimal = Field(..., gt=0)
    confidence: float = Field(..., ge=0, le=1)
    score: float = Field(..., ge=0, le=1)
    portfolioValue: Decimal = Field(default=Decimal("1000000"), description="Стоимость портфеля")
    currentExposure: Decimal = Field(default=Decimal("0"), description="Текущая экспозиция")


@router.get("/status", summary="Статус риск-менеджмента")
async def risk_status(
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    """Возвращает статус, лимиты и статистику."""
    data = container.risk_service.get_status()
    return SuccessEnvelope(data=data)


@router.get("/limits", summary="Лимиты риска")
async def risk_limits(
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    """Возвращает текущие лимиты."""
    data = container.risk_service.get_limits()
    return SuccessEnvelope(data=data)


@router.post("/limits", summary="Обновить лимиты")
async def risk_limits_update(
    body: dict,
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    """Обновляет лимиты риск-менеджмента."""
    limits = body.get("limits", body)
    data = container.risk_service.update_limits(limits)
    return SuccessEnvelope(data=data)


@router.post("/validate", summary="Валидировать ордер")
async def risk_validate(
    body: RiskValidateRequest,
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    """Проверяет ордер по лимитам риска."""
    data = container.risk_service.validate_order(
        figi=body.figi,
        action=body.action,
        quantity=body.quantity,
        price=body.price,
        confidence=body.confidence,
        score=body.score,
        portfolio_value=body.portfolioValue,
        current_exposure=body.currentExposure,
    )
    return SuccessEnvelope(data=data)
