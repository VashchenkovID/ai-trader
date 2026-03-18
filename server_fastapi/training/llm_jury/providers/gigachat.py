"""
Провайдер Giga Chat (Сбер) для LLM-жюри.

OAuth2: ngw.devices.sberbank.ru → access_token.
Chat: gigachat.devices.sberbank.ru/api/v1/chat/completions.
Переменные: GIGACHAT_CLIENT_ID, GIGACHAT_CLIENT_SECRET; опционально GIGACHAT_SCOPE (GIGACHAT_API_PERS).
Сертификаты: по умолчанию ssl_verify=False (официальная рекомендация для Giga Chat).
"""

from __future__ import annotations

import base64
import os
import uuid
from typing import Any

from app.core.config import get_settings
from training.llm_jury.parse_verdict import parse_verdict
from training.llm_jury.providers.base import JuryOpinion, LLMProviderBase

OAUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
CHAT_URL = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions"
DEFAULT_SCOPE = "GIGACHAT_API_PERS"


class GigaChatProvider(LLMProviderBase):
    """
    Провайдер Giga Chat. Требует GIGACHAT_CLIENT_ID и GIGACHAT_CLIENT_SECRET.
    При ошибке или отсутствии учётных данных возвращает HOLD 0.5.
    """

    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
        scope: str | None = None,
        timeout: float = 60.0,
        ssl_verify: bool = False,
    ):
        settings = get_settings()
        raw_client_id = (
            client_id
            if client_id is not None
            else (os.environ.get("GIGACHAT_CLIENT_ID") or settings.gigachat_client_id)
        )
        raw_client_secret = (
            client_secret
            if client_secret is not None
            else (os.environ.get("GIGACHAT_CLIENT_SECRET") or settings.gigachat_client_secret)
        )
        raw_scope = os.environ.get("GIGACHAT_SCOPE") if scope is None else scope
        self._client_id = (raw_client_id or "").strip()
        self._client_secret = (raw_client_secret or "").strip()
        self._scope = (raw_scope or DEFAULT_SCOPE).strip()
        self._timeout = timeout
        self._ssl_verify = ssl_verify

    @property
    def model_id(self) -> str:
        return "giga_chat"

    async def get_opinion(self, prompt: str) -> JuryOpinion:
        if not self._client_id or not self._client_secret:
            return JuryOpinion(
                model_id=self.model_id,
                action="HOLD",
                confidence=0.5,
                raw_text="",
            )
        try:
            import httpx
        except ImportError:
            return JuryOpinion(
                model_id=self.model_id,
                action="HOLD",
                confidence=0.5,
                raw_text="",
            )
        try:
            token = await self._get_token(httpx)
        except Exception:
            return JuryOpinion(
                model_id=self.model_id,
                action="HOLD",
                confidence=0.5,
                raw_text="",
            )
        payload: dict[str, Any] = {
            "model": "GigaChat",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 1024,
        }
        async with httpx.AsyncClient(
            timeout=self._timeout,
            verify=self._ssl_verify,
        ) as client:
            resp = await client.post(
                CHAT_URL,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
        raw_text = _extract_content(data)
        action, confidence = parse_verdict(raw_text)
        return JuryOpinion(
            model_id=self.model_id,
            action=action,
            confidence=confidence,
            raw_text=raw_text[:2000] if raw_text else "",
        )

    async def _get_token(self, httpx_module: Any) -> str:
        credentials = base64.b64encode(
            f"{self._client_id}:{self._client_secret}".encode()
        ).decode()
        async with httpx_module.AsyncClient(
            timeout=self._timeout,
            verify=self._ssl_verify,
        ) as client:
            r = await client.post(
                OAUTH_URL,
                headers={
                    "Authorization": f"Basic {credentials}",
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                    "RqUID": str(uuid.uuid4()),
                },
                data={"grant_type": "client_credentials", "scope": self._scope},
            )
            r.raise_for_status()
            out = r.json()
        return (out.get("access_token") or "").strip()


def _extract_content(data: dict[str, Any]) -> str:
    """Извлекает текст ответа из JSON Giga Chat (choices[0].message.content или аналог)."""
    choices = data.get("choices") or []
    if not choices:
        return ""
    msg = choices[0].get("message") or {}
    return (msg.get("content") or "").strip()
