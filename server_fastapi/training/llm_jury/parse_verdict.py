"""
Парсинг ответа LLM: извлечение action (BUY/SELL/HOLD) и confidence [0, 1] из текста.

Используется всеми провайдерами жюри при нете структурированного ответа.
"""

from __future__ import annotations

import json
import re
from typing import Iterable, Tuple

from training.llm_jury.providers.base import Action


def parse_verdict(text: str) -> Tuple[Action, float]:
    """
    Извлекает вердикт и уверенность из текста ответа LLM.
    Ищет BUY/SELL/HOLD (приоритет: BUY до SELL) и число 0–1 для confidence.
    Возвращает (action, confidence); при неудаче — (HOLD, 0.5).
    """
    if not text or not text.strip():
        return "HOLD", 0.5
    u = text.upper()
    action = _parse_action(u)
    confidence = _parse_confidence(text)
    return action, confidence


def _parse_action(u: str) -> Action:
    """Определяет действие по ключевым словам. BUY проверяем до SELL."""
    idx_buy = u.find("BUY") if "BUY" in u else 9999
    idx_sell = u.find("SELL") if "SELL" in u else 9999
    idx_hold = u.find("HOLD") if "HOLD" in u else 9999
    first = min((idx_buy, "BUY"), (idx_sell, "SELL"), (idx_hold, "HOLD"), key=lambda x: x[0])
    if first[0] == 9999:
        return "HOLD"
    return first[1]  # type: ignore[return-value]


def _parse_confidence(text: str) -> float:
    """Ищет confidence: число от 0 до 1 (форматы 0.5, 0,5, 50%)."""
    # Явный паттерн "confidence: 0.7" / "confidence 0.7" / "0.7"
    for pattern in (
        r"confidence\s*[:\s]+(\d+[.,]?\d*)",
        r"confidence\s*[:\s]*(\d+)\s*%",
        r"(\d+[.,]\d+)\s*\(?confidence",
        r"\b(0?\.\d+)\b",
        r"\b(0,\d+)\b",
    ):
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            raw = m.group(1).replace(",", ".")
            try:
                v = float(raw)
                if 0 <= v <= 1:
                    return round(v, 2)
                if 0 <= v <= 100 and "%" in pattern:
                    return round(v / 100.0, 2)
            except ValueError:
                continue
    return 0.5


def _normalize_batch_action(raw: object) -> Action:
    if raw is None:
        return "HOLD"
    u = str(raw).strip().upper()
    if u in ("BUY", "SELL", "HOLD"):
        return u  # type: ignore[return-value]
    return "HOLD"


def _normalize_batch_confidence(raw: object) -> float:
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return 0.5
    if v < 0 or v > 1:
        return 0.5
    return round(v, 4)


def _extract_json_object(text: str) -> dict | None:
    if not text or not str(text).strip():
        return None
    s = str(text).strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
        s = re.sub(r"\s*```\s*$", "", s)
    start = s.find("{")
    end = s.rfind("}")
    if start < 0 or end <= start:
        return None
    blob = s[start : end + 1]
    try:
        out = json.loads(blob)
    except json.JSONDecodeError:
        return None
    return out if isinstance(out, dict) else None


def parse_batch_verdict(
    text: str,
    expected_figis: Iterable[str],
) -> dict[str, tuple[Action, float]]:
    """
    Парсит JSON с ключом instruments: [{figi, action, confidence}, ...].
    Для каждого ожидаемого FIGI возвращает (action, confidence); при отсутствии — (HOLD, 0.5).
    """
    expected = [str(f).strip() for f in expected_figis if str(f).strip()]
    base: dict[str, tuple[Action, float]] = {f: ("HOLD", 0.5) for f in expected}
    data = _extract_json_object(text)
    if not data:
        return base
    items = data.get("instruments")
    if not isinstance(items, list):
        return base
    seen: set[str] = set()
    for row in items:
        if not isinstance(row, dict):
            continue
        figi = str(row.get("figi") or "").strip()
        if not figi or figi not in base or figi in seen:
            continue
        seen.add(figi)
        act = _normalize_batch_action(row.get("action"))
        conf = _normalize_batch_confidence(row.get("confidence"))
        base[figi] = (act, conf)
    return base
