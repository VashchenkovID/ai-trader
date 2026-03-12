from __future__ import annotations

from typing import Any

import pytest

from training.llm_jury.providers.alisa_gpt import AlisaGptProvider
from training.llm_jury.providers.deepseek import DeepSeekProvider
from training.llm_jury.providers.gigachat import GigaChatProvider
from training.llm_jury.providers.perplexity import PerplexityProvider


class _Resp:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return self._payload


class _AsyncClient:
    queue: list[dict[str, Any]] = []

    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, *args, **kwargs):
        payload = self.queue.pop(0) if self.queue else {}
        return _Resp(payload)


@pytest.mark.asyncio
async def test_deepseek_provider_no_key_fallback() -> None:
    provider = DeepSeekProvider(api_key="")
    opinion = await provider.get_opinion("anything")
    assert opinion.action == "HOLD"
    assert opinion.confidence == 0.5


@pytest.mark.asyncio
async def test_deepseek_provider_success(monkeypatch: pytest.MonkeyPatch) -> None:
    _AsyncClient.queue = [{"choices": [{"message": {"content": "BUY confidence: 0.81"}}]}]
    monkeypatch.setattr("httpx.AsyncClient", _AsyncClient)
    provider = DeepSeekProvider(api_key="x")
    opinion = await provider.get_opinion("p")
    assert opinion.model_id == "deepseek"
    assert opinion.action == "BUY"
    assert opinion.confidence == 0.81


@pytest.mark.asyncio
async def test_perplexity_provider_success(monkeypatch: pytest.MonkeyPatch) -> None:
    _AsyncClient.queue = [{"choices": [{"message": {"content": "SELL confidence: 0.6"}}]}]
    monkeypatch.setattr("httpx.AsyncClient", _AsyncClient)
    provider = PerplexityProvider(api_key="x")
    opinion = await provider.get_opinion("p")
    assert opinion.model_id == "perplexity"
    assert opinion.action == "SELL"
    assert opinion.confidence == 0.6


@pytest.mark.asyncio
async def test_gigachat_provider_success(monkeypatch: pytest.MonkeyPatch) -> None:
    _AsyncClient.queue = [
        {"access_token": "token-1"},
        {"choices": [{"message": {"content": "HOLD confidence: 0.55"}}]},
    ]
    monkeypatch.setattr("httpx.AsyncClient", _AsyncClient)
    provider = GigaChatProvider(client_id="id", client_secret="secret", ssl_verify=False)
    opinion = await provider.get_opinion("p")
    assert opinion.model_id == "giga_chat"
    assert opinion.action == "HOLD"
    assert opinion.confidence == 0.55


@pytest.mark.asyncio
async def test_alisa_provider_success(monkeypatch: pytest.MonkeyPatch) -> None:
    _AsyncClient.queue = [{"result": {"alternatives": [{"message": {"text": "BUY confidence: 0.7"}}]}}]
    monkeypatch.setattr("httpx.AsyncClient", _AsyncClient)
    provider = AlisaGptProvider(api_key="key", folder_id="folder")
    opinion = await provider.get_opinion("p")
    assert opinion.model_id == "alisa_gpt"
    assert opinion.action == "BUY"
    assert opinion.confidence == 0.7
