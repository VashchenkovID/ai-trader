"""Тесты PortfolioPositionPipelineService (без БД)."""

from __future__ import annotations

import uuid
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.portfolio_position_pipeline_service import PortfolioPositionPipelineService


def _row(
    *,
    figi: str,
    action: str = "BUY",
    conf: Decimal = Decimal("0.9"),
    market_score: Decimal | None = Decimal("0.8"),
) -> SimpleNamespace:
    return SimpleNamespace(
        final_action=action,
        final_confidence=conf,
        market_score=market_score,
    )


@pytest.mark.asyncio
async def test_ppr_pipeline_skips_hold() -> None:
    trading = AsyncMock()
    market = AsyncMock()
    trepo = AsyncMock()
    trepo.count_active_by_figi_and_profile = AsyncMock(return_value=0)
    ppr = AsyncMock()
    ppr.latest_by_figi_map = AsyncMock(
        return_value={"F1": _row(figi="F1", action="HOLD", conf=Decimal("0.99"))}
    )
    svc = PortfolioPositionPipelineService(
        trading_service=trading,
        market_repo=market,
        trading_repo=trepo,
        ppr_repo=ppr,
        auto_paper_service=None,
        portfolio_profile_config_service=None,
    )
    out = await svc.run_for_scope(
        MagicMock(),
        portfolio_scope="virtual:moderate",
        mode="paper",
        min_confidence=Decimal("0"),
        min_score=Decimal("0"),
        limit=50,
    )
    assert out["created"] == []
    assert any(s.get("reason") == "hold" for s in out["skipped"])
    trading.create_from_data.assert_not_called()


@pytest.mark.asyncio
async def test_ppr_pipeline_skips_below_threshold() -> None:
    trading = AsyncMock()
    market = AsyncMock()
    trepo = AsyncMock()
    trepo.count_active_by_figi_and_profile = AsyncMock(return_value=0)
    ppr = AsyncMock()
    ppr.latest_by_figi_map = AsyncMock(
        return_value={"F1": _row(figi="F1", action="BUY", conf=Decimal("0.1"))}
    )
    svc = PortfolioPositionPipelineService(
        trading_service=trading,
        market_repo=market,
        trading_repo=trepo,
        ppr_repo=ppr,
        auto_paper_service=None,
        portfolio_profile_config_service=None,
    )
    out = await svc.run_for_scope(
        MagicMock(),
        portfolio_scope="virtual:moderate",
        mode="paper",
        min_confidence=Decimal("0.5"),
        min_score=Decimal("0.5"),
        limit=50,
    )
    assert out["created"] == []
    assert any(s.get("reason") == "threshold" for s in out["skipped"])
    trading.create_from_data.assert_not_called()


@pytest.mark.asyncio
async def test_ppr_pipeline_creates_from_data() -> None:
    trading = AsyncMock()
    dto = {"id": uuid.uuid4(), "figi": "F1"}
    trading.create_from_data = AsyncMock(return_value=dto)
    inst = SimpleNamespace(last_price=Decimal("100"), ticker="TST", name="Test")
    market = AsyncMock()
    market.get_instrument_by_figi = AsyncMock(return_value=inst)
    trepo = AsyncMock()
    trepo.count_active_by_figi_and_profile = AsyncMock(return_value=0)
    trepo.list_requests = AsyncMock(return_value=([], 0))
    ppr = AsyncMock()
    ppr.latest_by_figi_map = AsyncMock(
        return_value={
            "F1": _row(
                figi="F1",
                action="BUY",
                conf=Decimal("0.9"),
                market_score=Decimal("0.85"),
            )
        }
    )
    auto_paper = AsyncMock()
    auto_paper.process_pending_paper_requests = AsyncMock(return_value={})
    svc = PortfolioPositionPipelineService(
        trading_service=trading,
        market_repo=market,
        trading_repo=trepo,
        ppr_repo=ppr,
        auto_paper_service=auto_paper,
        portfolio_profile_config_service=None,
    )
    out = await svc.run_for_scope(
        MagicMock(),
        portfolio_scope="virtual:moderate",
        mode="paper",
        min_confidence=Decimal("0"),
        min_score=Decimal("0"),
        limit=50,
    )
    assert out["created"] == ["F1"]
    assert out["skipped"] == []
    trading.create_from_data.assert_awaited_once()
    call_kw = trading.create_from_data.await_args
    assert call_kw.kwargs["virtual_profile_slug"] == "moderate"
    data = call_kw.args[1]
    assert data["recommendation"] == "BUY"
    assert data["figi"] == "F1"
    assert data["price"] == Decimal("100")


@pytest.mark.asyncio
async def test_ppr_pipeline_uses_final_confidence_when_no_market_score() -> None:
    trading = AsyncMock()
    dto = {"id": uuid.uuid4()}
    trading.create_from_data = AsyncMock(return_value=dto)
    market = AsyncMock()
    market.get_instrument_by_figi = AsyncMock(
        return_value=SimpleNamespace(last_price=Decimal("10"), ticker="X", name="Y")
    )
    trepo = AsyncMock()
    trepo.count_active_by_figi_and_profile = AsyncMock(return_value=0)
    trepo.list_requests = AsyncMock(return_value=([], 0))
    ppr = AsyncMock()
    ppr.latest_by_figi_map = AsyncMock(
        return_value={
            "F2": _row(
                figi="F2",
                action="SELL",
                conf=Decimal("0.7"),
                market_score=None,
            )
        }
    )
    auto_paper = AsyncMock()
    auto_paper.process_pending_paper_requests = AsyncMock(return_value={})
    svc = PortfolioPositionPipelineService(
        trading_service=trading,
        market_repo=market,
        trading_repo=trepo,
        ppr_repo=ppr,
        auto_paper_service=auto_paper,
        portfolio_profile_config_service=None,
    )
    out = await svc.run_for_scope(
        MagicMock(),
        portfolio_scope="real",
        mode="paper",
        min_confidence=Decimal("0.5"),
        min_score=Decimal("0.5"),
        limit=50,
    )
    assert out["created"] == ["F2"]
    data = trading.create_from_data.await_args.args[1]
    assert data["score"] == Decimal("0.7")
    assert trading.create_from_data.await_args.kwargs["virtual_profile_slug"] is None


@pytest.mark.asyncio
async def test_ppr_pipeline_sell_max_market_and_final_score_for_threshold() -> None:
    """Низкий рыночный score не должен резать SELL при высокой final_confidence."""
    trading = AsyncMock()
    dto = {"id": uuid.uuid4()}
    trading.create_from_data = AsyncMock(return_value=dto)
    market = AsyncMock()
    market.get_instrument_by_figi = AsyncMock(
        return_value=SimpleNamespace(last_price=Decimal("10"), ticker="X", name="Y")
    )
    trepo = AsyncMock()
    trepo.count_active_by_figi_and_profile = AsyncMock(return_value=0)
    trepo.list_requests = AsyncMock(return_value=([], 0))
    ppr = AsyncMock()
    ppr.latest_by_figi_map = AsyncMock(
        return_value={
            "F3": _row(
                figi="F3",
                action="SELL",
                conf=Decimal("0.8"),
                market_score=Decimal("0.12"),
            )
        }
    )
    auto_paper = AsyncMock()
    auto_paper.process_pending_paper_requests = AsyncMock(return_value={})
    svc = PortfolioPositionPipelineService(
        trading_service=trading,
        market_repo=market,
        trading_repo=trepo,
        ppr_repo=ppr,
        auto_paper_service=auto_paper,
        portfolio_profile_config_service=None,
    )
    out = await svc.run_for_scope(
        MagicMock(),
        portfolio_scope="virtual:moderate",
        mode="paper",
        min_confidence=Decimal("0.35"),
        min_score=Decimal("0.35"),
        limit=50,
    )
    assert out["created"] == ["F3"]
    score_passed = trading.create_from_data.await_args.args[1]["score"]
    assert score_passed == Decimal("0.8")


@pytest.mark.asyncio
async def test_ppr_pipeline_skips_duplicate_active() -> None:
    trading = AsyncMock()
    market = AsyncMock()
    market.get_instrument_by_figi = AsyncMock(
        return_value=SimpleNamespace(last_price=Decimal("1"), ticker="T", name="N")
    )
    trepo = AsyncMock()
    trepo.count_active_by_figi_and_profile = AsyncMock(return_value=1)
    ppr = AsyncMock()
    ppr.latest_by_figi_map = AsyncMock(
        return_value={"F1": _row(figi="F1", action="BUY")}
    )
    svc = PortfolioPositionPipelineService(
        trading_service=trading,
        market_repo=market,
        trading_repo=trepo,
        ppr_repo=ppr,
        auto_paper_service=None,
        portfolio_profile_config_service=None,
    )
    out = await svc.run_for_scope(
        MagicMock(),
        portfolio_scope="virtual:moderate",
        mode="paper",
        min_confidence=Decimal("0"),
        min_score=Decimal("0"),
        limit=50,
    )
    assert out["created"] == []
    assert any(s.get("reason") == "duplicate" for s in out["skipped"])
    trading.create_from_data.assert_not_called()
