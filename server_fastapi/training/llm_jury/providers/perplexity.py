"""
Провайдер Perplexity API для LLM-жюри.

Использует https://api.perplexity.ai/chat/completions (OpenAI-совместимый формат).
Переменная окружения: PERPLEXITY_API_KEY.
"""

from __future__ import annotations

import os
from typing import Any

from training.llm_jury.parse_verdict import parse_verdict
from training.llm_jury.providers.base import JuryOpinion, LLMProviderBase

PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions"
DEFAULT_MODEL = "sonar"


class PerplexityProvider(LLMProviderBase):
    """
    Провайдер Perplexity (Sonar). Требует PERPLEXITY_API_KEY.
    При ошибке или отсутствии ключа возвращает HOLD 0.5.
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str = DEFAULT_MODEL,
        timeout: float = 60.0,
    ):
        raw_key = os.environ.get("PERPLEXITY_API_KEY") if api_key is None else api_key
        self._api_key = (raw_key or "").strip()
        self._model = model
        self._timeout = timeout

    @property
    def model_id(self) -> str:
        return "perplexity"

    async def get_opinion(self, prompt: str) -> JuryOpinion:
        if not self._api_key:
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
            "model": self._model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 1024,
            "temperature": 0.2,
        }
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                PERPLEXITY_API_URL,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
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


def _extract_content(data: dict[str, Any]) -> str:
    """Извлекает текст ответа из JSON Perplexity (OpenAI-формат)."""
    choices = data.get("choices") or []
    if not choices:
        return ""
    msg = choices[0].get("message") or {}
    return (msg.get("content") or "").strip()
