from __future__ import annotations

import os

import pytest

from training.llm_jury.providers.alisa_gpt import AlisaGptProvider
from training.llm_jury.providers.deepseek import DeepSeekProvider
from training.llm_jury.providers.gigachat import GigaChatProvider
from training.llm_jury.providers.perplexity import PerplexityProvider

PROMPT = (
    "Ты инвестиционный аналитик. Дай короткий вердикт BUY/SELL/HOLD по условному активу "
    "и уверенность в диапазоне 0..1."
)


def _assert_opinion(opinion) -> None:
    assert opinion.model_id
    assert opinion.action in {"BUY", "SELL", "HOLD"}
    assert 0.0 <= float(opinion.confidence) <= 1.0


@pytest.mark.live_llm
@pytest.mark.asyncio
async def test_live_deepseek_provider_contract() -> None:
    pytest.skip("DeepSeek provider is disabled by current configuration")
    provider = DeepSeekProvider(timeout=20.0)
    opinion = await provider.get_opinion(PROMPT)
    _assert_opinion(opinion)


@pytest.mark.live_llm
@pytest.mark.asyncio
async def test_live_perplexity_provider_contract() -> None:
    pytest.skip("Perplexity provider is disabled by current configuration")
    provider = PerplexityProvider(timeout=20.0)
    opinion = await provider.get_opinion(PROMPT)
    _assert_opinion(opinion)


@pytest.mark.live_llm
@pytest.mark.asyncio
async def test_live_gigachat_provider_contract() -> None:
    if not os.getenv("GIGACHAT_CLIENT_ID") or not os.getenv("GIGACHAT_CLIENT_SECRET"):
        pytest.skip("GIGACHAT_CLIENT_ID / GIGACHAT_CLIENT_SECRET are not configured")
    provider = GigaChatProvider(timeout=20.0)
    opinion = await provider.get_opinion(PROMPT)
    _assert_opinion(opinion)


@pytest.mark.live_llm
@pytest.mark.asyncio
async def test_live_alisa_provider_contract() -> None:
    has_auth = bool(os.getenv("YANDEX_API_KEY") or os.getenv("YANDEX_IAM_TOKEN"))
    if not has_auth or not os.getenv("YANDEX_FOLDER_ID"):
        pytest.skip("YANDEX credentials are not configured")
    provider = AlisaGptProvider(timeout=20.0)
    opinion = await provider.get_opinion(PROMPT)
    _assert_opinion(opinion)
