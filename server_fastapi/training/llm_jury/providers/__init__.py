"""Провайдеры LLM для жюри: единый интерфейс «запрос–ответ» → мнение."""

from training.llm_jury.providers.base import JuryOpinion, LLMProviderBase
from training.llm_jury.providers.mock import MockLLMProvider
from training.llm_jury.providers.perplexity import PerplexityProvider
from training.llm_jury.providers.gigachat import GigaChatProvider
from training.llm_jury.providers.deepseek import DeepSeekProvider
from training.llm_jury.providers.alisa_gpt import AlisaGptProvider

__all__ = [
    "JuryOpinion",
    "LLMProviderBase",
    "MockLLMProvider",
    "PerplexityProvider",
    "GigaChatProvider",
    "DeepSeekProvider",
    "AlisaGptProvider",
]
