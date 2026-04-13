"""Тесты FIFO firstBuyAt и разбора операций Tinkoff."""

from __future__ import annotations

from datetime import datetime

from app.services.portfolio_position_timing import (
    fifo_first_buy_at,
    tinkoff_operations_to_trade_likes,
)


def test_fifo_first_buy_simple() -> None:
    trades = [
        {"figi": "F1", "action": "BUY", "quantity": 10, "at": "2024-01-10T12:00:00+00:00"},
        {"figi": "F1", "action": "SELL", "quantity": 5, "at": "2024-02-01T12:00:00+00:00"},
    ]
    first = fifo_first_buy_at("F1", trades)
    assert first is not None
    assert first.isoformat().startswith("2024-01-10")


def test_fifo_full_sell_rebuy() -> None:
    trades = [
        {"figi": "F1", "action": "BUY", "quantity": 10, "at": "2024-01-01T00:00:00+00:00"},
        {"figi": "F1", "action": "SELL", "quantity": 10, "at": "2024-02-01T00:00:00+00:00"},
        {"figi": "F1", "action": "BUY", "quantity": 3, "at": "2024-03-01T00:00:00+00:00"},
    ]
    first = fifo_first_buy_at("F1", trades)
    assert first is not None
    assert first.year == 2024 and first.month == 3


def test_tinkoff_operations_to_trade_likes() -> None:
    data = {
        "operations": [
            {
                "figi": "X",
                "operationType": "OPERATION_TYPE_BUY",
                "date": "2024-06-15T10:00:00Z",
                "quantity": {"units": "5", "nano": 0},
            },
            {
                "figi": "X",
                "operationType": "OPERATION_TYPE_SELL",
                "date": "2024-07-01T10:00:00Z",
                "quantity": {"units": 2, "nano": 0},
            },
        ]
    }
    likes = tinkoff_operations_to_trade_likes(data)
    assert len(likes) == 2
    assert likes[0]["action"] == "BUY"
    assert likes[1]["action"] == "SELL"


def test_tinkoff_operation_date_seconds() -> None:
    data = {
        "operations": [
            {
                "figi": "Y",
                "operationType": "OPERATION_TYPE_BUY",
                "date": {"seconds": 1700000000},
                "quantity": {"units": 1, "nano": 0},
            }
        ]
    }
    likes = tinkoff_operations_to_trade_likes(data)
    assert len(likes) == 1
    assert likes[0]["figi"] == "Y"
    dt = datetime.fromisoformat(likes[0]["at"].replace("Z", "+00:00"))
    assert dt.tzinfo is not None
