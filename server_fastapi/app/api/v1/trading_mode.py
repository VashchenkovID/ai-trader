from fastapi import APIRouter, Depends, Path

from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_container
from app.db.session import get_db_session
from app.schemas.envelope import SuccessEnvelope
from app.services.app_settings_persistence import upsert_app_setting
from app.services.audit_log import append_audit
from app.services.container import AppContainer

class TradingModeSwitchRequest(BaseModel):
    mode: str = Field(..., description="Целевой режим: paper, real, micro")


router = APIRouter(prefix="/trading-mode", tags=["trading-mode"])


@router.get("/current", summary="Текущий режим торговли")
async def trading_mode_current(
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    """Возвращает текущий режим торговли (paper, real, micro)."""
    mode = container.trading_mode_service.get_current_mode()
    return SuccessEnvelope(data={"mode": mode})


@router.post("/switch", summary="Переключить режим")
async def trading_mode_switch(
    body: TradingModeSwitchRequest,
    container: AppContainer = Depends(get_container),
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict]:
    """Переключает режим торговли."""
    data = container.trading_mode_service.switch_mode(body.mode)
    append_audit(
        "trading_mode_switch",
        {"to": body.mode, "previousMode": data.get("previousMode")},
    )
    await upsert_app_setting(db_session, "trading_mode", body.mode)
    await upsert_app_setting(db_session, "system.mode", body.mode)
    await db_session.commit()
    return SuccessEnvelope(data=data)


@router.get("/can-switch/{mode}", summary="Проверить возможность переключения")
async def trading_mode_can_switch(
    mode: str = Path(..., description="Целевой режим"),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict]:
    """Проверяет, можно ли переключиться на указанный режим."""
    data = container.trading_mode_service.can_switch_to(mode)
    return SuccessEnvelope(data=data)
