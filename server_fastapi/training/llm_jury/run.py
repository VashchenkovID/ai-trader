"""
Запуск LLM-жюри: один промпт → параллельный запрос ко всем провайдерам → список мнений и агрегаты.

Использование:
  opinions = await run_jury(ticker="SBER", context="...", providers=[...])
  consensus_score, dispersion = aggregate_opinions(opinions)
"""

from __future__ import annotations

import asyncio
from typing import Sequence

from training.llm_jury.prompts import build_jury_prompt
from training.llm_jury.providers.base import JuryOpinion, LLMProviderBase


ACTION_TO_SCORE = {"BUY": 1.0, "HOLD": 0.5, "SELL": 0.0}


async def run_jury(
    ticker: str,
    context: str,
    providers: Sequence[LLMProviderBase],
    role: str = "финансовый аналитик",
) -> list[JuryOpinion]:
    """
    Строит промпт по тикеру и контексту, запрашивает все провайдеры параллельно,
    возвращает список мнений. При ошибке одного провайдера — HOLD 0.5 для него.
    """
    prompt = build_jury_prompt(ticker=ticker, context=context, role=role)

    async def one(p: LLMProviderBase) -> JuryOpinion:
        try:
            return await p.get_opinion(prompt)
        except Exception:
            return JuryOpinion(model_id=p.model_id, action="HOLD", confidence=0.5, raw_text="")

    results = await asyncio.gather(*[one(p) for p in providers])
    return list(results)


def aggregate_opinions(opinions: list[JuryOpinion]) -> tuple[float, float]:
    """
    Консенсус (средний score 0–1) и дисперсия мнений (стандартное отклонение score).
    Для использования как фичи в пайплайне (2–3 агрегата LLM).
    """
    if not opinions:
        return 0.5, 0.0
    scores = [ACTION_TO_SCORE[o.action] * o.confidence + (1 - o.confidence) * 0.5 for o in opinions]
    mean = sum(scores) / len(scores)
    var = sum((s - mean) ** 2 for s in scores) / len(scores)
    return round(mean, 4), round(var ** 0.5, 4)
