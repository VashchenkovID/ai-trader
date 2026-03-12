"""
Mock-провайдер для тестов и разработки без API-ключей.

Возвращает фиксированное или случайное мнение по промпту.
"""

from __future__ import annotations

import random

from training.llm_jury.parse_verdict import parse_verdict
from training.llm_jury.providers.base import JuryOpinion, LLMProviderBase


class MockLLMProvider(LLMProviderBase):
    """Имитация провайдера: парсит BUY/SELL/HOLD из текста или возвращает HOLD 0.5."""

    def __init__(self, model_id: str = "mock"):
        self._model_id = model_id

    @property
    def model_id(self) -> str:
        return self._model_id

    async def get_opinion(self, prompt: str) -> JuryOpinion:
        action, parsed_conf = parse_verdict(prompt)
        confidence = round(parsed_conf * 0.5 + 0.25 + random.random() * 0.25, 2)
        confidence = min(1.0, max(0.0, confidence))
        return JuryOpinion(
            model_id=self._model_id,
            action=action,
            confidence=confidence,
            raw_text=f"[mock] {action} {confidence}",
        )
