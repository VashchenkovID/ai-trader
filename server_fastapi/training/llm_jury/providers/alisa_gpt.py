"""
Провайдер YandexGPT (Алиса GPT) для LLM-жюри.

Использует Yandex Cloud Foundation Models API (completion).
Переменные: YANDEX_API_KEY или YANDEX_IAM_TOKEN, YANDEX_FOLDER_ID.
Модель по умолчанию: yandexgpt-lite (можно переопределить через model_uri).
"""

from __future__ import annotations

import os
from typing import Any

from training.llm_jury.parse_verdict import parse_verdict
from training.llm_jury.providers.base import JuryOpinion, LLMProviderBase

YANDEX_COMPLETION_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
DEFAULT_MODEL_URI_TEMPLATE = "gpt://{folder_id}/yandexgpt-lite/latest"


class AlisaGptProvider(LLMProviderBase):
    """
    Провайдер YandexGPT (Алиса GPT). Требует YANDEX_API_KEY или YANDEX_IAM_TOKEN и YANDEX_FOLDER_ID.
    При ошибке или отсутствии учётных данных возвращает HOLD 0.5.
    """

    def __init__(
        self,
        api_key: str | None = None,
        iam_token: str | None = None,
        folder_id: str | None = None,
        model_uri: str | None = None,
        timeout: float = 60.0,
    ):
        raw_api_key = os.environ.get("YANDEX_API_KEY") if api_key is None else api_key
        raw_iam_token = os.environ.get("YANDEX_IAM_TOKEN") if iam_token is None else iam_token
        raw_folder_id = os.environ.get("YANDEX_FOLDER_ID") if folder_id is None else folder_id
        self._api_key = (raw_api_key or "").strip()
        self._iam_token = (raw_iam_token or "").strip()
        self._folder_id = (raw_folder_id or "").strip()
        if model_uri:
            self._model_uri = model_uri.strip()
        elif self._folder_id:
            self._model_uri = DEFAULT_MODEL_URI_TEMPLATE.format(folder_id=self._folder_id)
        else:
            self._model_uri = ""
        self._timeout = timeout

    @property
    def model_id(self) -> str:
        return "alisa_gpt"

    def _get_auth_header(self) -> dict[str, str]:
        if self._api_key:
            return {"Authorization": f"Api-Key {self._api_key}"}
        if self._iam_token:
            return {"Authorization": f"Bearer {self._iam_token}"}
        return {}

    async def get_opinion(self, prompt: str) -> JuryOpinion:
        if not self._model_uri or not (self._api_key or self._iam_token):
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
        payload: dict[str, Any] = {
            "modelUri": self._model_uri,
            "completionOptions": {"temperature": 0.2, "maxTokens": "1024"},
            "messages": [{"role": "user", "text": prompt}],
        }
        headers = {"Content-Type": "application/json", **self._get_auth_header()}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                YANDEX_COMPLETION_URL,
                headers=headers,
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


def _extract_content(data: dict[str, Any]) -> str:
    """Извлекает текст ответа из JSON Yandex (result.alternatives[0].message.text)."""
    result = data.get("result") or {}
    alternatives = result.get("alternatives") or []
    if not alternatives:
        return ""
    first = alternatives[0]
    msg = first.get("message") or {}
    return (msg.get("text") or first.get("text") or "").strip()
