from __future__ import annotations

import os

import pytest

from app.services.telegram_service import TelegramConfig, TelegramService


@pytest.mark.live_telegram
def test_live_telegram_bot_send() -> None:
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    chat_id = (os.getenv("TELEGRAM_CHAT_ID") or "").strip()
    if not token or not chat_id:
        pytest.skip("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not configured")

    service = TelegramService(
        TelegramConfig(token=token, default_chat_id=chat_id, enabled=True)
    )
    out = service.send_message("ai-trader-fastapi live telegram test")
    assert out["ok"] is True
