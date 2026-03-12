from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.services.telegram_service import TelegramConfig, TelegramService


def test_telegram_service_disabled_status_and_send() -> None:
    service = TelegramService(TelegramConfig(token="", default_chat_id="", enabled=False))
    status = service.get_status()
    assert status["enabled"] is False
    assert service.test_connection()["ok"] is False
    assert service.send_message("hello")["ok"] is False


def test_telegram_service_requires_chat_id() -> None:
    service = TelegramService(TelegramConfig(token="token", default_chat_id="", enabled=True))
    out = service.send_message("hello")
    assert out["ok"] is False
    assert "chat_id" in out["message"]


def test_telegram_service_send_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = {"ok": True, "result": {"message_id": 10}}
    mock_client = MagicMock()
    mock_client.post.return_value = response
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    monkeypatch.setattr("app.services.telegram_service.httpx.Client", MagicMock(return_value=mock_client))
    service = TelegramService(TelegramConfig(token="token", default_chat_id="123", enabled=True))

    msg = service.send_message("hello world")
    assert msg["ok"] is True
    assert msg["result"]["message_id"] == 10

    report = service.send_system_report({"mode": "shadow", "workers": 2, "tasks": 5})
    assert report["ok"] is True

    alert = service.send_alert("Critical", "Something happened")
    assert alert["ok"] is True
