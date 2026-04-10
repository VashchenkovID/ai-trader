"""Тесты батч-парсера и run_jury_batch_chunk."""

import pytest

from training.llm_jury.parse_verdict import parse_batch_verdict
from training.llm_jury.providers.base import JuryOpinion
from training.llm_jury.providers.gigachat import GigaChatProvider
from training.llm_jury.run import run_jury_batch_chunk


def test_parse_batch_verdict_full() -> None:
    figis = ["F1", "F2"]
    text = '{"instruments":[{"figi":"F1","action":"BUY","confidence":0.7},{"figi":"F2","action":"SELL","confidence":0.4}]}'
    out = parse_batch_verdict(text, figis)
    assert out["F1"][0] == "BUY" and out["F1"][1] == 0.7
    assert out["F2"][0] == "SELL" and out["F2"][1] == 0.4


def test_parse_batch_verdict_markdown_fence() -> None:
    figis = ["A"]
    text = '```json\n{"instruments":[{"figi":"A","action":"HOLD","confidence":0.55}]}\n```'
    out = parse_batch_verdict(text, figis)
    assert out["A"][0] == "HOLD"


def test_parse_batch_verdict_missing_figi_fallback() -> None:
    figis = ["X", "Y"]
    text = '{"instruments":[{"figi":"X","action":"BUY","confidence":0.6}]}'
    out = parse_batch_verdict(text, figis)
    assert out["X"][0] == "BUY"
    assert out["Y"] == ("HOLD", 0.5)


def test_parse_batch_verdict_invalid_json() -> None:
    figis = ["Z"]
    out = parse_batch_verdict("not json", figis)
    assert out["Z"] == ("HOLD", 0.5)


@pytest.mark.asyncio
async def test_run_jury_batch_chunk_mock_providers() -> None:
    """Два «провайдера» с фиксированным JSON; без реальных HTTP."""

    class _FixedJsonProvider(GigaChatProvider):
        def __init__(self, mid: str, json_body: str) -> None:
            super().__init__(client_id="", client_secret="")
            self._mid = mid
            self._json = json_body

        @property
        def model_id(self) -> str:
            return self._mid

        async def get_opinion(self, prompt: str) -> JuryOpinion:  # type: ignore[override]
            return JuryOpinion(model_id=self._mid, action="HOLD", confidence=0.5, raw_text=self._json)

    body = (
        '{"instruments":['
        '{"figi":"FIGI-A","action":"BUY","confidence":0.8},'
        '{"figi":"FIGI-B","action":"HOLD","confidence":0.5}'
        "]}"
    )
    p1 = _FixedJsonProvider("giga_chat", body)
    p2 = _FixedJsonProvider("yandexgpt", body)
    items = [
        {"figi": "FIGI-A", "ticker": "AAA", "context": "c1"},
        {"figi": "FIGI-B", "ticker": "BBB", "context": "c2"},
    ]
    out = await run_jury_batch_chunk(items, [p1, p2])
    by_figi = out["byFigi"]
    assert by_figi["FIGI-A"]["required_providers_present"] is True
    assert by_figi["FIGI-B"]["required_providers_present"] is True
    assert len(out["rawOpinions"]) == 2
