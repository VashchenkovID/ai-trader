"""Интеграционные тесты репозиториев с реальной БД."""

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.market_repository import MarketRepository
from app.repositories.news_repository import NewsRepository
from app.repositories.performance_repository import PerformanceRepository
from app.repositories.profitability_repository import ProfitabilityRepository
from app.repositories.trading_request_repository import TradingRequestRepository


# --- TradingRequestRepository ---


@pytest.mark.asyncio
async def test_trading_request_repository_list_requests(
    db_session: AsyncSession,
) -> None:
    repo = TradingRequestRepository()
    items, total = await repo.list_requests(db_session)
    assert isinstance(items, list)
    assert total >= 0
    assert len(items) <= 50


@pytest.mark.asyncio
async def test_trading_request_repository_list_requests_with_filters(
    db_session: AsyncSession,
) -> None:
    repo = TradingRequestRepository()
    items, total = await repo.list_requests(
        db_session, status="PENDING", mode="paper", offset=0, limit=10
    )
    assert isinstance(items, list)
    assert total >= 0
    for item in items:
        assert item.status == "PENDING"
        assert item.mode == "paper"


@pytest.mark.asyncio
async def test_trading_request_repository_create_get_update(
    db_session: AsyncSession,
) -> None:
    repo = TradingRequestRepository()
    figi = f"TEST-REPO-{uuid4().hex[:12]}"
    req = await repo.create(
        db_session,
        figi=figi,
        mode="paper",
        action="BUY",
        quantity=1,
        price=Decimal("100"),
        budget=Decimal("100"),
    )
    assert req.id is not None
    assert req.status == "PENDING"

    found = await repo.get_by_id(db_session, req.id)
    assert found is not None
    assert found.figi == figi

    updated = await repo.update_status(
        db_session,
        req.id,
        "APPROVED",
        approved_at=datetime.now(timezone.utc),
    )
    assert updated is not None
    assert updated.status == "APPROVED"

    await repo.update_status(db_session, req.id, "CANCELLED")
    await db_session.rollback()


@pytest.mark.asyncio
async def test_trading_request_repository_count_active_by_figi(
    db_session: AsyncSession,
) -> None:
    repo = TradingRequestRepository()
    figi = f"TEST-COUNT-{uuid4().hex[:12]}"
    count = await repo.count_active_by_figi(db_session, figi=figi)
    assert count >= 0


@pytest.mark.asyncio
async def test_trading_request_repository_count_by_status_figi(
    db_session: AsyncSession,
) -> None:
    repo = TradingRequestRepository()
    count = await repo.count_by_status_figi(
        db_session, figi="NONEXISTENT-FIGI", status="PENDING"
    )
    assert count == 0


@pytest.mark.asyncio
async def test_trading_request_repository_get_by_id_not_found(
    db_session: AsyncSession,
) -> None:
    repo = TradingRequestRepository()
    found = await repo.get_by_id(db_session, uuid4())
    assert found is None


# --- MarketRepository ---


@pytest.mark.asyncio
async def test_market_repository_list_instruments(db_session: AsyncSession) -> None:
    repo = MarketRepository()
    items = await repo.list_instruments(db_session, offset=0, limit=10)
    assert isinstance(items, list)


@pytest.mark.asyncio
async def test_market_repository_count_instruments(db_session: AsyncSession) -> None:
    repo = MarketRepository()
    count = await repo.count_instruments(db_session)
    assert count >= 0


@pytest.mark.asyncio
async def test_market_repository_list_recommendations(db_session: AsyncSession) -> None:
    repo = MarketRepository()
    items = await repo.list_recommendations(db_session, offset=0, limit=10)
    assert isinstance(items, list)


@pytest.mark.asyncio
async def test_market_repository_count_recommendations(
    db_session: AsyncSession,
) -> None:
    repo = MarketRepository()
    count = await repo.count_recommendations(db_session)
    assert count >= 0


@pytest.mark.asyncio
async def test_market_repository_get_instrument_by_figi(
    db_session: AsyncSession,
) -> None:
    repo = MarketRepository()
    inst = await repo.get_instrument_by_figi(db_session, "NONEXISTENT-FIGI")
    assert inst is None


@pytest.mark.asyncio
async def test_market_repository_get_recommendation_by_figi(
    db_session: AsyncSession,
) -> None:
    repo = MarketRepository()
    rec = await repo.get_recommendation_by_figi(db_session, "NONEXISTENT-FIGI")
    assert rec is None


@pytest.mark.asyncio
async def test_market_repository_upsert_recommendation_with_llm_payload(
    db_session: AsyncSession,
) -> None:
    repo = MarketRepository()
    figi = f"TEST-REC-{uuid4().hex[:10]}"
    created = await repo.upsert_recommendation(
        db_session,
        figi=figi,
        recommendation="HOLD",
        confidence=Decimal("0.5000"),
        score=Decimal("0.5000"),
        llm_jury_payload={"providers": {"gigachat": {"action": "HOLD"}}},
    )
    assert created.figi == figi
    assert created.llm_jury_payload is not None
    updated = await repo.upsert_recommendation(
        db_session,
        figi=figi,
        recommendation="BUY",
        confidence=Decimal("0.7300"),
        score=Decimal("0.6200"),
        llm_jury_payload={"providers": {"alisa_gpt": {"action": "BUY"}}},
    )
    assert updated.recommendation == "BUY"
    assert (updated.llm_jury_payload or {}).get("providers") is not None
    await db_session.rollback()


@pytest.mark.asyncio
async def test_market_repository_get_candles_by_figi(
    db_session: AsyncSession,
) -> None:
    repo = MarketRepository()
    candles = await repo.get_candles_by_figi(
        db_session, figi="NONEXISTENT-FIGI", limit=10
    )
    assert candles == []


@pytest.mark.asyncio
async def test_market_repository_count_candles_by_figi(
    db_session: AsyncSession,
) -> None:
    repo = MarketRepository()
    count = await repo.count_candles_by_figi(db_session, figi="NONEXISTENT-FIGI")
    assert count == 0


# --- NewsRepository ---


@pytest.mark.asyncio
async def test_news_repository_count_and_last_update(
    db_session: AsyncSession,
) -> None:
    repo = NewsRepository()
    count, last_update = await repo.count_and_last_update(db_session)
    assert count >= 0
    assert last_update is None or isinstance(last_update, datetime)


@pytest.mark.asyncio
async def test_news_repository_list_news_by_figi(db_session: AsyncSession) -> None:
    repo = NewsRepository()
    items = await repo.list_news_by_figi(
        db_session, figi="BBG004730N88", offset=0, limit=5, days=30
    )
    assert isinstance(items, list)


@pytest.mark.asyncio
async def test_news_repository_count_news_by_figi(db_session: AsyncSession) -> None:
    repo = NewsRepository()
    count = await repo.count_news_by_figi(
        db_session, figi="BBG004730N88", days=30
    )
    assert count >= 0


# --- PerformanceRepository ---


@pytest.mark.asyncio
async def test_performance_repository_list_sector_counts(
    db_session: AsyncSession,
) -> None:
    repo = PerformanceRepository()
    items = await repo.list_sector_counts(db_session, offset=0, limit=10)
    assert isinstance(items, list)
    for item in items:
        assert isinstance(item, tuple)
        assert len(item) == 2


@pytest.mark.asyncio
async def test_performance_repository_count_sector_groups(
    db_session: AsyncSession,
) -> None:
    repo = PerformanceRepository()
    count = await repo.count_sector_groups(db_session)
    assert count >= 0


@pytest.mark.asyncio
async def test_performance_repository_trading_request_count(
    db_session: AsyncSession,
) -> None:
    repo = PerformanceRepository()
    count = await repo.trading_request_count(db_session)
    assert count >= 0


@pytest.mark.asyncio
async def test_performance_repository_list_benchmarks(
    db_session: AsyncSession,
) -> None:
    repo = PerformanceRepository()
    items = await repo.list_benchmarks(db_session, offset=0, limit=10)
    assert isinstance(items, list)


@pytest.mark.asyncio
async def test_performance_repository_count_benchmarks(
    db_session: AsyncSession,
) -> None:
    repo = PerformanceRepository()
    count = await repo.count_benchmarks(db_session)
    assert count >= 0


@pytest.mark.asyncio
async def test_performance_repository_list_sectors(
    db_session: AsyncSession,
) -> None:
    repo = PerformanceRepository()
    items = await repo.list_sectors(db_session, offset=0, limit=10)
    assert isinstance(items, list)


@pytest.mark.asyncio
async def test_performance_repository_count_sectors(
    db_session: AsyncSession,
) -> None:
    repo = PerformanceRepository()
    count = await repo.count_sectors(db_session)
    assert count >= 0


# --- ProfitabilityRepository ---


@pytest.mark.asyncio
async def test_profitability_repository_status_summary(
    db_session: AsyncSession,
) -> None:
    repo = ProfitabilityRepository()
    count, last_update = await repo.status_summary(db_session)
    assert count >= 0
    assert last_update is None or isinstance(last_update, datetime)


@pytest.mark.asyncio
async def test_profitability_repository_pnl_aggregate(
    db_session: AsyncSession,
) -> None:
    repo = ProfitabilityRepository()
    gross_profit, gross_loss, total_count, win_count = await repo.pnl_aggregate(
        db_session
    )
    assert isinstance(gross_profit, Decimal)
    assert isinstance(gross_loss, Decimal)
    assert total_count >= 0
    assert win_count >= 0
