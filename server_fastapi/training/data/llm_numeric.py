"""Извлечение числовых llm_score_* из payload рекомендаций (REWRITE_CORE §8)."""

from __future__ import annotations

from typing import Any


def _try_float(key: str, obj: dict[str, Any]) -> float | None:
    if key not in obj:
        return None
    try:
        return float(obj[key])
    except (TypeError, ValueError):
        return None


def extract_llm_scores_from_jury_payload(payload: dict[str, Any] | None) -> dict[str, float]:
    """
    Унифицированные факторы из llm_jury_payload / агрегатов / блока fusion `llm`.
    Контракт API: поля `llmConsensus`, `llmDispersion` (camelCase) заполняются из этих ключей.
    Возвращает: llm_consensus, llm_dispersion (если есть).
    """
    if not payload or not isinstance(payload, dict):
        return {}
    out: dict[str, float] = {}
    agg = payload.get("aggregate") or payload.get("aggregated") or {}
    if isinstance(agg, dict):
        v = _try_float("consensus", agg)
        if v is not None:
            out["llm_consensus"] = v
        v = _try_float("dispersion", agg)
        if v is not None:
            out["llm_dispersion"] = v
    # Scheduler fusion: llm_jury_payload с вложенным llm { consensus, dispersion, ... }
    llm_block = payload.get("llm")
    if isinstance(llm_block, dict):
        for key, out_key in (
            ("consensus", "llm_consensus"),
            ("dispersion", "llm_dispersion"),
            ("confidenceAvg", "llm_confidence_avg"),
        ):
            v = _try_float(key, llm_block)
            if v is not None:
                out[out_key] = v
    return out
