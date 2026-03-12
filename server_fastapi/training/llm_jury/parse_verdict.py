"""
Парсинг ответа LLM: извлечение action (BUY/SELL/HOLD) и confidence [0, 1] из текста.

Используется всеми провайдерами жюри при нете структурированного ответа.
"""

from __future__ import annotations

import re
from typing import Tuple

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
