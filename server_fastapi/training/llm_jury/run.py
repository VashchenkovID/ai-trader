"""
Запуск LLM-жюри: один промпт → параллельный запрос ко всем провайдерам → список мнений и агрегаты.

Использование:
  opinions = await run_jury(ticker="SBER", context="...", providers=[...])
  consensus_score, dispersion = aggregate_opinions(opinions)
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Sequence

from training.llm_jury.parse_verdict import parse_batch_verdict
from training.llm_jury.prompts import build_jury_batch_prompt, build_jury_prompt
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


def _provider_payload_key(model_id: str) -> str:
    normalized = (model_id or "").strip().lower().replace("-", "_")
    aliases = {
        "giga_chat": "gigachat",
        "gigachat": "gigachat",
        "alisa": "alisa_gpt",
        "alisa_gpt": "alisa_gpt",
        "yandexgpt": "alisa_gpt",
    }
    return aliases.get(normalized, normalized)


async def run_jury_batch_chunk(
    items: list[dict[str, str]],
    providers: Sequence[LLMProviderBase],
    role: str = "финансовый аналитик",
) -> dict[str, Any]:
    """
    Один батч-промпт по списку инструментов; параллельный вызов провайдеров.
    items: элементы с ключами figi, context; опционально ticker.

    Возвращает:
      {
        "byFigi": {
          figi: {
            "consensus", "dispersion", "confidence_avg",
            "provider_payload", "required_providers_present",
          }
        }
      }
    """
    if not items or not providers:
        return {"byFigi": {}, "rawOpinions": []}
    figis = [str(i.get("figi") or "").strip() for i in items]
    figis = [f for f in figis if f]
    if not figis:
        return {"byFigi": {}, "rawOpinions": []}
    lines: list[str] = []
    for n, it in enumerate(items):
        figi = str(it.get("figi") or "").strip()
        if not figi:
            continue
        ticker = str(it.get("ticker") or "").strip()
        ctx = str(it.get("context") or "").strip()
        tick_part = f"тикер {ticker}; " if ticker else ""
        lines.append(f"{len(lines) + 1}. FIGI={figi}; {tick_part}{ctx}")
    prompt = build_jury_batch_prompt(lines, role=role)

    async def one(p: LLMProviderBase) -> JuryOpinion:
        try:
            return await p.get_opinion(prompt)
        except Exception:
            return JuryOpinion(model_id=p.model_id, action="HOLD", confidence=0.5, raw_text="")

    raw_opinions = await asyncio.gather(*[one(p) for p in providers])
    parsed_maps: list[dict[str, tuple[str, float]]] = []
    for op in raw_opinions:
        parsed_maps.append(parse_batch_verdict(op.raw_text, figis))

    required_keys = ("gigachat", "alisa_gpt")
    by_figi: dict[str, Any] = {}
    payload_ts = datetime.now(timezone.utc).isoformat()

    for figi in figis:
        per_figi_ops: list[JuryOpinion] = []
        provider_payload: dict[str, dict[str, object]] = {}

        for p, op, pmap in zip(providers, raw_opinions, parsed_maps):
            act, conf = pmap.get(figi, ("HOLD", 0.5))
            per_figi_ops.append(
                JuryOpinion(model_id=p.model_id, action=act, confidence=conf, raw_text="")
            )
            model_key = _provider_payload_key(p.model_id)
            raw_text = (op.raw_text[:2000] if op.raw_text else "")
            if _is_mock_provider_id(p.model_id) or not raw_text.strip():
                continue
            provider_payload[model_key] = {
                "modelId": p.model_id,
                "action": act,
                "confidence": round(float(conf), 4),
                "rawText": raw_text,
                "createdAt": payload_ts,
            }

        consensus, dispersion = aggregate_opinions(per_figi_ops)
        confidence_avg = (
            sum(o.confidence for o in per_figi_ops) / len(per_figi_ops) if per_figi_ops else 0.5
        )
        required_present = all(k in provider_payload for k in required_keys)
        by_figi[figi] = {
            "consensus": consensus,
            "dispersion": dispersion,
            "confidence_avg": round(float(confidence_avg), 4),
            "provider_payload": provider_payload,
            "required_providers_present": required_present,
        }

    return {"byFigi": by_figi, "rawOpinions": list(raw_opinions)}


def build_by_figi_from_manual_dual_raw(
    figis: list[str],
    gigachat_raw: str,
    alisa_raw: str,
    role: str = "финансовый аналитик",
) -> dict[str, Any]:
    """
    Парсит два сырых батч-ответа (GigaChat + Алиса) без HTTP, как в run_jury_batch_chunk.

    Возвращает тот же каркас, что run_jury_batch_chunk: ``byFigi`` и ``rawOpinions``
    (два JuryOpinion с полным raw_text для persist_llm_jury_batch_chunk).
    Параметр ``role`` оставлен для согласованности сигнатуры с батч-промптом (не используется).
    """
    del role  # prompt built elsewhere; kept for API symmetry
    if not figis:
        return {"byFigi": {}, "rawOpinions": []}
    clean = [str(f).strip() for f in figis if str(f).strip()]
    if not clean:
        return {"byFigi": {}, "rawOpinions": []}

    pmap_g = parse_batch_verdict(gigachat_raw, clean)
    pmap_a = parse_batch_verdict(alisa_raw, clean)
    raw_op_g = JuryOpinion(
        model_id="giga_chat",
        action="HOLD",
        confidence=0.5,
        raw_text=gigachat_raw or "",
    )
    raw_op_a = JuryOpinion(
        model_id="alisa_gpt",
        action="HOLD",
        confidence=0.5,
        raw_text=alisa_raw or "",
    )
    providers_meta: list[tuple[str, dict[str, tuple[str, float]], JuryOpinion]] = [
        ("giga_chat", pmap_g, raw_op_g),
        ("alisa_gpt", pmap_a, raw_op_a),
    ]

    required_keys = ("gigachat", "alisa_gpt")
    by_figi: dict[str, Any] = {}
    payload_ts = datetime.now(timezone.utc).isoformat()

    for figi in clean:
        per_figi_ops: list[JuryOpinion] = []
        provider_payload: dict[str, dict[str, object]] = {}

        for model_id, pmap, op in providers_meta:
            act, conf = pmap.get(figi, ("HOLD", 0.5))
            per_figi_ops.append(
                JuryOpinion(model_id=model_id, action=act, confidence=conf, raw_text="")
            )
            model_key = _provider_payload_key(model_id)
            raw_text = (op.raw_text[:2000] if op.raw_text else "")
            if _is_mock_provider_id(model_id) or not raw_text.strip():
                continue
            provider_payload[model_key] = {
                "modelId": model_id,
                "action": act,
                "confidence": round(float(conf), 4),
                "rawText": raw_text,
                "createdAt": payload_ts,
            }

        consensus, dispersion = aggregate_opinions(per_figi_ops)
        confidence_avg = (
            sum(o.confidence for o in per_figi_ops) / len(per_figi_ops) if per_figi_ops else 0.5
        )
        required_present = all(k in provider_payload for k in required_keys)
        by_figi[figi] = {
            "consensus": consensus,
            "dispersion": dispersion,
            "confidence_avg": round(float(confidence_avg), 4),
            "provider_payload": provider_payload,
            "required_providers_present": required_present,
        }

    return {"byFigi": by_figi, "rawOpinions": [raw_op_g, raw_op_a]}


def _is_mock_provider_id(model_id: str) -> bool:
    normalized = (model_id or "").strip().lower().replace("-", "_")
    return normalized in {"mock", "mock_llm", "mock_provider"}


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
