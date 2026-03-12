"""
Базовый интерфейс провайдера LLM-жюри.

Один запрос (prompt) → нормализованное мнение: action (BUY/SELL/HOLD), confidence [0,1].
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Literal


Action = Literal["BUY", "SELL", "HOLD"]


@dataclass
class JuryOpinion:
    """Мнение одного провайдера LLM."""
    model_id: str
    action: Action
    confidence: float
    raw_text: str = ""


class LLMProviderBase(ABC):
    """Абстрактный провайдер: один метод запроса, возвращает JuryOpinion."""

    @property
    @abstractmethod
    def model_id(self) -> str:
        """Идентификатор модели (deepseek, perplexity, giga_chat, alisa и т.д.)."""
        ...

    @abstractmethod
    async def get_opinion(self, prompt: str) -> JuryOpinion:
        """
        Отправляет промпт в API, парсит ответ в action и confidence.
        При ошибке или невозможности распарсить — возвращать нейтральное мнение (HOLD, 0.5).
        """
        ...
