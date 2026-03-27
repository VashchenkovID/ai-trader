"""
Сервис запуска LLM-жюри по FIGI и сохранения мнений и агрегатов в БД.

Использует training.llm_jury.run.run_jury и провайдеры из training.llm_jury.providers.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_utils import iso_now_msk, now_msk
from app.db.models import LlmJuryAggregate, LlmJuryOpinion


async def run_jury_for_figi(
    db_session: AsyncSession,
    figi: str,
    ticker: str,
    context: str,
    providers: list,
    role: str = "финансовый аналитик",
) -> dict[str, object]:
    """
    Запускает жюри по тикеру и контексту, сохраняет каждое мнение в llm_jury_opinions
    и один агрегат в llm_jury_aggregates. Возвращает сводку.
    """
    from training.llm_jury.run import run_jury, aggregate_opinions

    opinions = await run_jury(ticker=ticker, context=context, providers=providers, role=role)
    consensus, dispersion = aggregate_opinions(opinions)
    confidence_avg = sum(o.confidence for o in opinions) / len(opinions) if opinions else 0.5
    now = now_msk()
    payload_ts = iso_now_msk()
    provider_payload: dict[str, dict[str, object]] = {}

    for o in opinions:
        model_key = _provider_key(o.model_id)
        raw_text = (o.raw_text[:2000] if o.raw_text else "")
        # Не сохраняем mock и пустые fallback-ответы провайдеров в payload рекомендаций.
        if _is_mock_model_id(o.model_id) or not raw_text.strip():
            continue
        provider_payload[model_key] = {
            "modelId": o.model_id,
            "action": o.action,
            "confidence": round(float(o.confidence), 4),
            "rawText": raw_text,
            "createdAt": payload_ts,
        }
        row = LlmJuryOpinion(
            figi=figi,
            model_id=o.model_id,
            action=o.action,
            confidence=Decimal(str(round(o.confidence, 4))),
            raw_text=raw_text,
        )
        db_session.add(row)

    agg_row = LlmJuryAggregate(
        figi=figi,
        aggregate_date=now,
        consensus=Decimal(str(consensus)),
        dispersion=Decimal(str(dispersion)),
        confidence_avg=Decimal(str(round(confidence_avg, 4))),
    )
    db_session.add(agg_row)
    await db_session.commit()

    required_providers = ("gigachat", "alisa_gpt")
    required_present = all(key in provider_payload for key in required_providers)

    return {
        "figi": figi,
        "ticker": ticker,
        "opinions_count": len(opinions),
        "consensus": consensus,
        "dispersion": dispersion,
        "confidence_avg": round(confidence_avg, 4),
        "provider_payload": provider_payload,
        "required_providers_present": required_present,
    }


def _provider_key(model_id: str) -> str:
    normalized = (model_id or "").strip().lower().replace("-", "_")
    aliases = {
        "giga_chat": "gigachat",
        "gigachat": "gigachat",
        "alisa": "alisa_gpt",
        "alisa_gpt": "alisa_gpt",
        "yandexgpt": "alisa_gpt",
    }
    return aliases.get(normalized, normalized)


def _is_mock_model_id(model_id: str) -> bool:
    normalized = (model_id or "").strip().lower().replace("-", "_")
    return normalized in {"mock", "mock_llm", "mock_provider"}
