"""Позиция RUB000UTSTOM и оценка стоимости после нормализации Tinkoff (currentPrice.value)."""

from __future__ import annotations

import pytest

from app.services.tinkoff_portfolio_helpers import (
    TINKOFF_RUB_CASH_POSITION_FIGI,
    merge_rub_cash,
    positions_value_rub_excluding_cash,
    rub_cash_position_value_rub,
    total_rub_cash_from_positions,
    without_rub_cash_positions,
)


def test_rub_cash_figi_constant() -> None:
    assert TINKOFF_RUB_CASH_POSITION_FIGI == "RUB000UTSTOM"


def test_positions_value_normalized_current_price_value_key() -> None:
    positions = [
        {"figi": "F1", "quantity": 2.0, "currentPrice": {"value": 50.0, "currency": "RUB"}},
    ]
    assert positions_value_rub_excluding_cash(positions) == pytest.approx(100.0)


def test_positions_value_excludes_rub_cash_figi() -> None:
    positions = [
        {"figi": "F1", "quantity": 1.0, "currentPrice": {"value": 10.0, "currency": "RUB"}},
        {
            "figi": TINKOFF_RUB_CASH_POSITION_FIGI,
            "quantity": 5000.0,
            "currentPrice": {"value": 1.0, "currency": "RUB"},
        },
    ]
    assert positions_value_rub_excluding_cash(positions) == pytest.approx(10.0)


def test_without_rub_cash_positions_filters() -> None:
    raw = [
        {"figi": "A"},
        {"figi": TINKOFF_RUB_CASH_POSITION_FIGI},
    ]
    assert len(without_rub_cash_positions(raw)) == 1


def test_total_rub_cash_from_positions() -> None:
    positions = [
        {
            "figi": TINKOFF_RUB_CASH_POSITION_FIGI,
            "quantity": 100.0,
            "currentPrice": {"value": 1.0},
        },
    ]
    assert total_rub_cash_from_positions(positions) == pytest.approx(100.0)


def test_rub_cash_position_uses_price_one_when_missing() -> None:
    p = {"figi": TINKOFF_RUB_CASH_POSITION_FIGI, "quantity": 50.0, "currentPrice": {"value": 0.0}}
    assert rub_cash_position_value_rub(p) == pytest.approx(50.0)


def test_merge_rub_cash() -> None:
    assert merge_rub_cash(0, 500) == pytest.approx(500)
    assert merge_rub_cash(500, 0) == pytest.approx(500)
    assert merge_rub_cash(1000, 1000) == pytest.approx(1000)
    assert merge_rub_cash(100, 300) == pytest.approx(400)
