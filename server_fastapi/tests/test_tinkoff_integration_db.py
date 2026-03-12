"""Интеграционные тесты Tinkoff-контуров (получение + запись в БД)."""

from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Instrument, RealPortfolio
from app.main import app
from app.repositories.market_repository import MarketRepository
from app.scheduler import _instruments_update_job, _last_prices_job, _portfolio_sync_job


@pytest.mark.asyncio
async def test_portfolio_endpoint_reads_from_tinkoff_client(client) -> None:
    """Проверяем получение данных: API /portfolio читает ответы Tinkoff-клиента."""
    original_client = app.state.container.tinkoff_client
    app.state.container.tinkoff_client = SimpleNamespace(
        get_portfolio=lambda: {
            "positions": [
                {"figi": "FIGI-READ", "quantity": 2, "currentPrice": {"units": "100", "nano": 0}}
            ],
            "totalAmountPortfolio": {"value": 0},
        },
        get_positions=lambda: {"money": [{"currency": "RUB", "value": {"units": "50", "nano": 0}}]},
    )
    try:
        response = await client.get("/api/v1/portfolio")
        assert response.status_code == 200
        payload = response.json()
        assert payload["success"] is True
        assert payload["data"]["positions"]["FIGI-READ"] == 2
        assert payload["data"]["cash"] == pytest.approx(50.0)
    finally:
        app.state.container.tinkoff_client = original_client


@pytest.mark.asyncio
async def test_instruments_update_job_writes_russian_shares_only(
    db_session: AsyncSession,
) -> None:
    """Проверяем запись в БД: job обновления инструментов пишет только российские акции."""
    repo = MarketRepository()
    figi_ru = f"TINKOFF-RU-{uuid4().hex[:10]}"
    figi_us = f"TINKOFF-US-{uuid4().hex[:10]}"
    container = SimpleNamespace(
        tinkoff_client=SimpleNamespace(
            get_shares=lambda: {
                "instruments": [
                    {
                        "figi": figi_ru,
                        "ticker": "SBER",
                        "name": "Sberbank",
                        "currency": "RUB",
                        "exchange": "MOEX",
                        "countryOfRisk": "RU",
                        "lotSize": 10,
                        "sector": "financial",
                    },
                    {
                        "figi": figi_us,
                        "ticker": "AAPL",
                        "name": "Apple",
                        "currency": "USD",
                        "exchange": "NASDAQ",
                        "countryOfRisk": "US",
                        "lotSize": 1,
                        "sector": "it",
                    },
                ]
            }
        ),
        market_repository=repo,
    )

    await _instruments_update_job(container)
    db_session.expire_all()

    ru = await db_session.scalar(select(Instrument).where(Instrument.figi == figi_ru))
    us = await db_session.scalar(select(Instrument).where(Instrument.figi == figi_us))
    assert ru is not None
    assert ru.ticker == "SBER"
    assert us is None

    await db_session.execute(delete(Instrument).where(Instrument.figi.in_([figi_ru, figi_us])))
    await db_session.commit()


@pytest.mark.asyncio
async def test_last_prices_job_updates_existing_instruments(db_session: AsyncSession) -> None:
    """Проверяем запись в БД: job последних цен обновляет поле last_price у инструмента."""
    repo = MarketRepository()
    figi = f"TINKOFF-PRICE-{uuid4().hex[:10]}"
    await repo.upsert_instrument(
        db_session,
        figi=figi,
        ticker="TEST",
        name="Test Instrument",
        currency="RUB",
        lot=1,
        last_price=1.0,
    )
    await db_session.commit()

    container = SimpleNamespace(
        tinkoff_client=SimpleNamespace(
            get_last_prices=lambda figis: {
                "lastPrices": [
                    {"figi": figi, "price": {"units": "123", "nano": 500_000_000}},
                    {"figi": "IGNORED", "price": 0},
                ]
            }
        ),
        market_repository=repo,
    )

    await _last_prices_job(container)
    db_session.expire_all()

    updated = await db_session.scalar(select(Instrument).where(Instrument.figi == figi))
    assert updated is not None
    assert float(updated.last_price or 0) == pytest.approx(123.5)

    await db_session.execute(delete(Instrument).where(Instrument.figi == figi))
    await db_session.commit()


@pytest.mark.asyncio
async def test_portfolio_sync_job_writes_real_portfolio_snapshot(db_session: AsyncSession) -> None:
    """Проверяем запись в БД: job портфеля создаёт/обновляет снимок real_portfolio."""
    try:
        before = await db_session.scalar(select(RealPortfolio).where(RealPortfolio.id == 1))
    except ProgrammingError:
        pytest.skip("Table real_portfolio not available (run alembic upgrade head)")
    backup = None
    if before is not None:
        backup = {
            "cash": before.cash,
            "positions": dict(before.positions or {}),
            "trades": list(before.trades or []),
            "total_value": before.total_value,
            "positions_value": before.positions_value,
            "initial_capital": before.initial_capital,
            "version": before.version,
        }

    container = SimpleNamespace(
        tinkoff_client=SimpleNamespace(
            get_portfolio=lambda: {
                "positions": [{"figi": "FIGI-SYNC", "quantity": 3, "currentPrice": 100}],
                "totalAmountPortfolio": {"value": 0},
            },
            get_positions=lambda: {"money": [{"currency": "RUB", "value": 70}], "positions": []},
        )
    )

    try:
        await _portfolio_sync_job(container)
        db_session.expire_all()
        row = await db_session.scalar(select(RealPortfolio).where(RealPortfolio.id == 1))
        assert row is not None
        assert row.positions.get("FIGI-SYNC") == 3
        assert row.cash == pytest.approx(70.0)
        assert row.positions_value == pytest.approx(300.0)
        assert row.total_value == pytest.approx(370.0)
    finally:
        if backup is None:
            await db_session.execute(delete(RealPortfolio).where(RealPortfolio.id == 1))
        else:
            row = await db_session.scalar(select(RealPortfolio).where(RealPortfolio.id == 1))
            if row is not None:
                row.cash = backup["cash"]
                row.positions = backup["positions"]
                row.trades = backup["trades"]
                row.total_value = backup["total_value"]
                row.positions_value = backup["positions_value"]
                row.initial_capital = backup["initial_capital"]
                row.version = backup["version"]
        await db_session.commit()
