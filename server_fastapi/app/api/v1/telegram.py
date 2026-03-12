from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_container
from app.db.models import AppSetting
from app.db.session import get_db_session
from app.schemas.envelope import SuccessEnvelope
from app.services.container import AppContainer

router = APIRouter(tags=["telegram"])


class TelegramMessageBody(BaseModel):
    text: str = Field(..., min_length=1)
    chat_id: str | None = None


class TelegramAlertBody(BaseModel):
    title: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)
    chat_id: str | None = None


class NotificationSettingsBody(BaseModel):
    enabled: bool
    default_chat_id: str | None = None


@router.get("/telegram/status", summary="Статус Telegram подсистемы")
async def telegram_status(container: AppContainer = Depends(get_container)) -> SuccessEnvelope[dict[str, Any]]:
    return SuccessEnvelope(data=container.telegram_service.get_status())


@router.post("/telegram/test", summary="Проверка соединения с Telegram bot API")
async def telegram_test(container: AppContainer = Depends(get_container)) -> SuccessEnvelope[dict[str, Any]]:
    return SuccessEnvelope(data=await asyncio.to_thread(container.telegram_service.test_connection))


@router.post("/telegram/send", summary="Отправка произвольного сообщения в Telegram")
async def telegram_send(
    body: TelegramMessageBody,
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict[str, Any]]:
    return SuccessEnvelope(
        data=await asyncio.to_thread(container.telegram_service.send_message, body.text, body.chat_id)
    )


@router.post("/telegram/alerts/system", summary="Отправка системного алерта в Telegram")
async def telegram_system_alert(
    body: TelegramAlertBody,
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict[str, Any]]:
    return SuccessEnvelope(
        data=await asyncio.to_thread(
            container.telegram_service.send_alert,
            body.title,
            body.message,
            body.chat_id,
        )
    )


@router.get("/notifications/settings", summary="Настройки telegram-уведомлений (DB)")
async def notifications_get_settings(
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, Any]]:
    try:
        enabled_row = await db_session.scalar(
            select(AppSetting).where(AppSetting.key == "telegram.notifications_enabled").limit(1)
        )
        chat_row = await db_session.scalar(
            select(AppSetting).where(AppSetting.key == "telegram.default_chat_id").limit(1)
        )
    except Exception:
        enabled_row = None
        chat_row = None
    return SuccessEnvelope(
        data={
            "enabled": enabled_row.value == "true" if enabled_row else False,
            "defaultChatId": chat_row.value if chat_row else None,
        }
    )


@router.post("/notifications/settings", summary="Сохранить настройки telegram-уведомлений (DB)")
async def notifications_set_settings(
    body: NotificationSettingsBody,
    db_session: AsyncSession = Depends(get_db_session),
) -> SuccessEnvelope[dict[str, Any]]:
    try:
        enabled_row = await db_session.scalar(
            select(AppSetting).where(AppSetting.key == "telegram.notifications_enabled").limit(1)
        )
        chat_row = await db_session.scalar(
            select(AppSetting).where(AppSetting.key == "telegram.default_chat_id").limit(1)
        )

        if enabled_row is None:
            enabled_row = AppSetting(
                key="telegram.notifications_enabled",
                value="true" if body.enabled else "false",
                value_type="string",
                module="telegram",
                description="Включены ли Telegram уведомления",
            )
            db_session.add(enabled_row)
        else:
            enabled_row.value = "true" if body.enabled else "false"

        if body.default_chat_id is not None:
            if chat_row is None:
                chat_row = AppSetting(
                    key="telegram.default_chat_id",
                    value=body.default_chat_id,
                    value_type="string",
                    module="telegram",
                    description="Chat ID по умолчанию для Telegram уведомлений",
                )
                db_session.add(chat_row)
            else:
                chat_row.value = body.default_chat_id

        await db_session.commit()
    except Exception:
        # Если БД недоступна/не инициализирована, возвращаем примененные значения без persistence.
        pass
    return SuccessEnvelope(
        data={"enabled": body.enabled, "defaultChatId": body.default_chat_id}
    )
