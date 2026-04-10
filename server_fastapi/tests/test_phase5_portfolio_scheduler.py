from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.api.v1.portfolio import _positions_value as api_positions_value
from app.api.v1.portfolio import get_portfolio, portfolio_sync
from app.core.errors import AppError
from app.scheduler import (
    _create_task_record,
    _instruments_update_job,
    _is_russian_share,
    _last_prices_job,
    _tasks,
    _MAX_TASK_RECORDS,
    _parse_cron,
    _portfolio_sync_job,
    start_tinkoff_scheduler,
)


class _SessionCtx:
    def __init__(self, session: object) -> None:
        self._session = session

    async def __aenter__(self) -> object:
        return self._session

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False


def test_api_positions_value_supports_dict_and_float() -> None:
    positions = [
        {"quantity": 2, "currentPrice": {"units": "10", "nano": 500_000_000}},
        {"quantity": 3, "currentPrice": 5.0},
    ]
    assert api_positions_value(positions) == pytest.approx(36.0)


@pytest.mark.asyncio
async def test_get_portfolio_raises_when_tinkoff_not_configured() -> None:
    container = SimpleNamespace(tinkoff_client=None)
    with pytest.raises(AppError) as err:
        await get_portfolio(container=container)
    assert err.value.error_code == "SERVICE_UNAVAILABLE"


@pytest.mark.asyncio
async def test_get_portfolio_builds_contract_from_tinkoff_data() -> None:
    client = SimpleNamespace(
        get_portfolio=Mock(
            return_value={
                "positions": [
                    {"figi": "F1", "quantity": 2, "currentPrice": {"units": "100", "nano": 0}}
                ],
                "totalAmountPortfolio": {"value": 0},
            }
        ),
        get_positions=Mock(
            return_value={
                "positions": [],
                "money": [
                    {"currency": "RUB", "value": {"units": "10", "nano": 0}},
                    {"currency": "USD", "value": 99},
                ],
            }
        ),
    )
    market_repo = SimpleNamespace(
        map_last_prices_by_figis=AsyncMock(return_value={"F1": 100.0}),
    )
    container = SimpleNamespace(tinkoff_client=client, market_repository=market_repo)

    response = await get_portfolio(container=container)

    assert response.data["cash"] == pytest.approx(10.0)
    assert response.data["positions"] == {"F1": 2}
    assert response.data["positionsValue"] == pytest.approx(200.0)
    # totalAmountPortfolio=0 => fallback to cash + positions_value
    assert response.data["totalValue"] == pytest.approx(210.0)


@pytest.mark.asyncio
async def test_portfolio_sync_aliases_get_portfolio(monkeypatch: pytest.MonkeyPatch) -> None:
    expected = SimpleNamespace(data={"ok": True})

    async def _fake_get_portfolio(*, container):
        return expected

    monkeypatch.setattr("app.api.v1.portfolio.get_portfolio", _fake_get_portfolio)
    response = await portfolio_sync(container=SimpleNamespace())
    assert response is expected


def test_parse_cron_valid_and_invalid() -> None:
    assert _parse_cron("*/5 * * * 1-5") == {
        "minute": "*/5",
        "hour": "*",
        "day": "*",
        "month": "*",
        "day_of_week": "1-5",
    }
    with pytest.raises(ValueError):
        _parse_cron("invalid")


def test_is_russian_share_rules() -> None:
    assert _is_russian_share({"countryOfRisk": "RU", "currency": "RUB", "exchange": "SPB"})
    assert _is_russian_share({"countryOfRisk": "US", "currency": "RUB", "exchange": "MOEX_PLUS"})
    assert not _is_russian_share({"countryOfRisk": "US", "currency": "USD", "exchange": "NASDAQ"})


def test_start_scheduler_disabled_or_without_client() -> None:
    container_no_client = SimpleNamespace(tinkoff_client=None)
    settings_enabled = SimpleNamespace(tinkoff_token="token", tinkoff_scheduler_enabled=True)
    assert start_tinkoff_scheduler(container_no_client, settings_enabled) is None

    container_with_client = SimpleNamespace(tinkoff_client=object())
    settings_no_token = SimpleNamespace(tinkoff_token="", tinkoff_scheduler_enabled=True)
    assert start_tinkoff_scheduler(container_with_client, settings_no_token) is None


def test_start_scheduler_registers_three_jobs_and_shutdown(monkeypatch: pytest.MonkeyPatch) -> None:
    scheduler_mock = Mock()
    scheduler_mock.add_job = Mock()
    scheduler_mock.start = Mock()
    scheduler_mock.shutdown = Mock()
    monkeypatch.setattr("app.scheduler.AsyncIOScheduler", Mock(return_value=scheduler_mock))

    container = SimpleNamespace(tinkoff_client=object())
    settings = SimpleNamespace(
        tinkoff_token="token",
        tinkoff_scheduler_enabled=True,
        tinkoff_portfolio_sync_cron="*/15 * * * *",
        tinkoff_instruments_cron="0 */2 * * *",
        tinkoff_prices_cron="0 */1 * * *",
    )

    scheduler = start_tinkoff_scheduler(container, settings)
    assert scheduler is scheduler_mock
    assert scheduler_mock.add_job.call_count == 3
    scheduler_mock.start.assert_called_once()

    from app.scheduler import shutdown_tinkoff_scheduler

    shutdown_tinkoff_scheduler()
    scheduler_mock.shutdown.assert_called_once_with(wait=False)


@pytest.mark.asyncio
async def test_portfolio_sync_job_creates_or_updates_snapshot(monkeypatch: pytest.MonkeyPatch) -> None:
    existing = SimpleNamespace(
        cash=0.0, positions={}, total_value=0.0, positions_value=0.0, last_updated=None
    )

    class FakeSession:
        def __init__(self, row):
            self._row = row
            self.committed = False
            self.added = None

        async def scalar(self, _stmt):
            return self._row

        def add(self, row):
            self.added = row

        async def flush(self):
            return None

        async def commit(self):
            self.committed = True

    session = FakeSession(existing)
    monkeypatch.setattr("app.scheduler.SessionLocal", lambda: _SessionCtx(session))

    client = SimpleNamespace(
        get_portfolio=Mock(
            return_value={
                "positions": [{"figi": "F1", "quantity": 1, "currentPrice": 100}],
                "totalAmountPortfolio": {"value": 0},
            }
        ),
        get_positions=Mock(return_value={"money": [{"currency": "RUB", "value": 50}], "positions": []}),
    )
    container = SimpleNamespace(tinkoff_client=client)

    await _portfolio_sync_job(container)

    assert existing.positions == {"F1": 1}
    assert existing.cash == 50.0
    assert existing.positions_value == pytest.approx(100.0)
    assert existing.total_value == pytest.approx(150.0)
    assert session.committed is True


@pytest.mark.asyncio
async def test_instruments_update_job_filters_and_upserts(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeSession:
        committed = False

        async def commit(self):
            self.committed = True

    session = FakeSession()
    monkeypatch.setattr("app.scheduler.SessionLocal", lambda: _SessionCtx(session))

    market_repo = SimpleNamespace(upsert_instrument=AsyncMock())
    client = SimpleNamespace(
        get_shares=Mock(
            return_value={
                "instruments": [
                    {
                        "figi": "RU1",
                        "ticker": "SBER",
                        "name": "Sber",
                        "currency": "RUB",
                        "exchange": "MOEX",
                        "countryOfRisk": "RU",
                        "lotSize": 10,
                    },
                    {
                        "figi": "US1",
                        "ticker": "AAPL",
                        "name": "Apple",
                        "currency": "USD",
                        "exchange": "NASDAQ",
                        "countryOfRisk": "US",
                        "lotSize": 1,
                    },
                ]
            }
        )
    )
    container = SimpleNamespace(tinkoff_client=client, market_repository=market_repo)

    await _instruments_update_job(container)

    assert market_repo.upsert_instrument.await_count == 1
    assert session.committed is True


@pytest.mark.asyncio
async def test_last_prices_job_reads_figi_and_updates_prices(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeSession:
        def __init__(self):
            self.committed = False

        async def commit(self):
            self.committed = True

    first_session = FakeSession()
    second_session = FakeSession()
    sessions = iter([first_session, second_session])
    monkeypatch.setattr("app.scheduler.SessionLocal", lambda: _SessionCtx(next(sessions)))

    market_repo = SimpleNamespace(
        list_figi=AsyncMock(return_value=["F1", "F2"]),
        update_last_price=AsyncMock(),
    )
    client = SimpleNamespace(
        get_last_prices=Mock(
            return_value={
                "lastPrices": [
                    {"figi": "F1", "price": {"units": "10", "nano": 0}},
                    {"figi": "F2", "price": 0},
                    {"figi": "", "price": 100},
                ]
            }
        )
    )
    container = SimpleNamespace(tinkoff_client=client, market_repository=market_repo)

    await _last_prices_job(container)

    market_repo.list_figi.assert_awaited_once()
    assert market_repo.update_last_price.await_count == 1
    second_session_commit = second_session.committed
    assert second_session_commit is True


def test_task_storage_retention_limit() -> None:
    _tasks.clear()
    for i in range(_MAX_TASK_RECORDS + 50):
        _create_task_record(task_type=f"job-{i}", source="test")
    assert len(_tasks) == _MAX_TASK_RECORDS
