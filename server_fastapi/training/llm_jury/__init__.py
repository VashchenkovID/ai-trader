"""
LLM-жюри: единый промпт → запросы к провайдерам → парсинг в мнение (BUY/SELL/HOLD + confidence).
"""

from training.llm_jury.prompts import build_jury_prompt
from training.llm_jury.providers import JuryOpinion, LLMProviderBase
from training.llm_jury.run import run_jury, aggregate_opinions

__all__ = [
    "build_jury_prompt",
    "JuryOpinion",
    "LLMProviderBase",
    "run_jury",
    "aggregate_opinions",
]
