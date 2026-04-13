"""
Денежная позиция RUB000UTSTOM (Tinkoff) — рублёвый остаток на счёте, не ценная бумага.
Учёт в cash, исключение из positionsList / positions_value.

Также единая оценка цены позиции: после нормализации currentPrice = {value, currency}, не {units, nano}.
"""

from __future__ import annotations

from app.services.tinkoff_client import price_units_nano_to_float, tinkoff_quotation_quantity_to_float

# Безналичные рубли на брокерском счёте как «инструмент» в GetPortfolio/GetPositions.
TINKOFF_RUB_CASH_POSITION_FIGI = "RUB000UTSTOM"


def position_unit_price_rub_for_valuation(p: dict) -> float:
    """Цена за единицу для оценки позиции: last из БД, иначе quotation, иначе value из нормализованного ответа."""
    lip = p.get("instrumentLastPrice")
    if lip is not None:
        try:
            v = float(lip)
            if v > 0:
                return v
        except (TypeError, ValueError):
            pass
    cur = p.get("currentPrice") or {}
    if isinstance(cur, dict):
        if cur.get("units") is not None or cur.get("nano"):
            return price_units_nano_to_float(cur)
        val = cur.get("value")
        if val is not None:
            try:
                return float(val)
            except (TypeError, ValueError):
                pass
    try:
        return float(cur) if not isinstance(cur, dict) else 0.0
    except (TypeError, ValueError):
        return 0.0


def rub_cash_position_value_rub(position: dict) -> float:
    """Стоимость позиции-кэша RUB000UTSTOM в рублях (количество × цена; цена по умолчанию 1 ₽)."""
    if str(position.get("figi") or "") != TINKOFF_RUB_CASH_POSITION_FIGI:
        return 0.0
    q = tinkoff_quotation_quantity_to_float(position.get("quantity"))
    px = position_unit_price_rub_for_valuation(position)
    if px <= 0:
        px = 1.0
    return q * px


def total_rub_cash_from_positions(positions: list[dict]) -> float:
    s = 0.0
    for p in positions:
        if isinstance(p, dict):
            s += rub_cash_position_value_rub(p)
    return s


def without_rub_cash_positions(positions: list) -> list:
    return [
        p
        for p in positions
        if isinstance(p, dict) and str(p.get("figi") or "") != TINKOFF_RUB_CASH_POSITION_FIGI
    ]


def merge_rub_cash(money_rub: float, rub_position_rub: float) -> float:
    """
    Кэш из GetPositions.money и позиция RUB000UTSTOM часто дублируют друг друга.
    Если оба ~равны — одно значение; если одно ноль — второе; если сильно различаются — сумма.
    """
    m = float(money_rub or 0)
    r = float(rub_position_rub or 0)
    if m <= 0.005 and r > 0:
        return r
    if r <= 0.005:
        return m
    lo, hi = (m, r) if m <= r else (r, m)
    if hi > 0 and abs(m - r) <= max(hi * 0.02, 1.0):
        return hi
    return m + r


def positions_value_rub_excluding_cash(positions: list[dict]) -> float:
    """Суммарная стоимость бумаг (без RUB000UTSTOM)."""
    total = 0.0
    for p in positions:
        if not isinstance(p, dict):
            continue
        if str(p.get("figi") or "") == TINKOFF_RUB_CASH_POSITION_FIGI:
            continue
        q = tinkoff_quotation_quantity_to_float(p.get("quantity"))
        total += q * position_unit_price_rub_for_valuation(p)
    return total
