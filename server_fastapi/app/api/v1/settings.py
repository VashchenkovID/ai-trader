from fastapi import APIRouter, Depends, Query

from app.api.deps import get_container
from app.core.errors import AppError
from app.schemas.envelope import SuccessEnvelope
from app.schemas.platform import (
    KellySettingsDTO,
    KellySettingsUpdateRequest,
    SettingsUpdateRequest,
    SettingItemDTO,
)
from app.services.container import AppContainer

router = APIRouter(tags=["settings"])


@router.get("/settings", summary="Список системных настроек")
async def get_settings(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=1000),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict[str, object]]:
    items, total = container.settings_service.get_all(offset=offset, limit=limit)
    return SuccessEnvelope(data={"items": items, "meta": {"offset": offset, "limit": limit, "total": total}})


@router.put("/settings", summary="Обновление настройки по ключу")
async def update_settings(
    payload: SettingsUpdateRequest,
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[SettingItemDTO]:
    item = container.settings_service.update(payload.key, payload.value)
    return SuccessEnvelope(data=item)


@router.get("/settings/kelly", summary="Текущие параметры Келли")
async def get_kelly_settings(
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[KellySettingsDTO]:
    return SuccessEnvelope(data=container.settings_service.get_kelly())


@router.put("/settings/kelly", summary="Обновление параметров Келли")
async def update_kelly_settings(
    payload: KellySettingsUpdateRequest,
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[KellySettingsDTO]:
    updates = payload.model_dump(exclude_none=True)
    if "conservativeFactor" in updates and not (0 <= updates["conservativeFactor"] <= 1):
        raise AppError("BAD_REQUEST", message="conservativeFactor должен быть между 0 и 1")
    if "minTrades" in updates and updates["minTrades"] < 1:
        raise AppError("BAD_REQUEST", message="minTrades должен быть больше 0")
    if "volatilityPeriod" in updates and not (7 <= updates["volatilityPeriod"] <= 365):
        raise AppError("BAD_REQUEST", message="volatilityPeriod должен быть между 7 и 365 днями")
    updated = container.settings_service.update_kelly(updates)
    return SuccessEnvelope(data=updated)
