from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


@dataclass
class TelegramConfig:
    token: str
    default_chat_id: str
    enabled: bool


class TelegramService:
    """Минимальный parity-сервис Telegram: status/test/send/report."""

    def __init__(self, config: TelegramConfig) -> None:
        self._config = config

    @property
    def enabled(self) -> bool:
        return self._config.enabled and bool(self._config.token)

    def get_status(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "hasToken": bool(self._config.token),
            "defaultChatId": self._config.default_chat_id or None,
        }

    def test_connection(self) -> dict[str, Any]:
        if not self.enabled:
            return {"ok": False, "message": "Telegram disabled or token not configured"}
        return self.send_message("Telegram connection test from ai-trader-fastapi")

    def send_system_report(self, report: dict[str, Any], chat_id: str | None = None) -> dict[str, Any]:
        text = (
            "System report\n"
            f"- mode: {report.get('mode', 'unknown')}\n"
            f"- workers: {report.get('workers', 'n/a')}\n"
            f"- tasks: {report.get('tasks', 'n/a')}"
        )
        return self.send_message(text, chat_id=chat_id)

    def send_alert(self, title: str, message: str, chat_id: str | None = None) -> dict[str, Any]:
        return self.send_message(f"[ALERT] {title}\n{message}", chat_id=chat_id)

    def send_message(self, text: str, chat_id: str | None = None) -> dict[str, Any]:
        if not self.enabled:
            return {"ok": False, "message": "Telegram disabled or token not configured"}
        target_chat = chat_id or self._config.default_chat_id
        if not target_chat:
            return {"ok": False, "message": "chat_id is not configured"}

        base_url = f"https://api.telegram.org/bot{self._config.token}"
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                f"{base_url}/sendMessage",
                json={"chat_id": target_chat, "text": text},
            )
            response.raise_for_status()
            payload = response.json()
        return {"ok": bool(payload.get("ok")), "result": payload.get("result")}
