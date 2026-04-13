"""Юнит-тесты позиционного анализа портфеля (промпт/парсинг/scope)."""

from __future__ import annotations

from app.core.portfolio_scope import (
    PORTFOLIO_SCOPE_REAL,
    all_portfolio_scopes,
    canonical_portfolio_scope,
    is_valid_portfolio_scope,
    virtual_scope,
)
from app.services.portfolio_position_analysis_service import (
    PortfolioPositionAnalysisService,
    extract_json_object,
)
from app.services.virtual_portfolio_service import VirtualPortfolioService


def test_portfolio_scope_validation() -> None:
    assert is_valid_portfolio_scope("real")
    assert is_valid_portfolio_scope("virtual:moderate")
    assert is_valid_portfolio_scope("virtual:Moderate")
    assert not is_valid_portfolio_scope("virtual:unknown")
    assert not is_valid_portfolio_scope("moderate")


def test_canonical_portfolio_scope() -> None:
    assert canonical_portfolio_scope("virtual:Moderate") == virtual_scope("moderate")
    assert canonical_portfolio_scope("real") == PORTFOLIO_SCOPE_REAL


def test_all_portfolio_scopes_includes_real_and_virtual() -> None:
    scopes = all_portfolio_scopes()
    assert PORTFOLIO_SCOPE_REAL in scopes
    assert virtual_scope("moderate") in scopes


def test_extract_json_object() -> None:
    raw = '```json\n{"instruments":[{"figi":"x","action":"BUY","confidence":0.7}]}\n```'
    obj = extract_json_object(raw)
    assert obj is not None
    assert obj["instruments"][0]["figi"] == "x"


def test_parse_llm_verdict() -> None:
    from app.core.config import Settings
    from app.repositories.market_repository import MarketRepository
    from app.repositories.portfolio_position_recommendation_repository import (
        PortfolioPositionRecommendationRepository,
    )
    from app.services.virtual_portfolio_service import VirtualPortfolioService

    svc = PortfolioPositionAnalysisService(
        settings=Settings(),
        market_repo=MarketRepository(),
        virtual_portfolio_service=VirtualPortfolioService(
            market_repo=MarketRepository(),
            repo=__import__(
                "app.repositories.virtual_portfolio_repository",
                fromlist=["VirtualPortfolioRepository"],
            ).VirtualPortfolioRepository(),
        ),
        ppr_repo=PortfolioPositionRecommendationRepository(),
        tinkoff_client=None,
    )
    parsed, full = svc.parse_llm_verdict(
        '{"instruments":[{"figi":"F1","action":"sell","confidence":0.61,"reasons":["a"]}]}'
    )
    assert full is not None
    assert len(parsed) == 1
    assert parsed[0]["figi"] == "F1"
    assert parsed[0]["action"] == "SELL"


def test_build_verdict_prompt_contains_positions() -> None:
    from app.core.config import Settings
    from app.repositories.market_repository import MarketRepository
    from app.repositories.portfolio_position_recommendation_repository import (
        PortfolioPositionRecommendationRepository,
    )
    from app.repositories.virtual_portfolio_repository import VirtualPortfolioRepository

    svc = PortfolioPositionAnalysisService(
        settings=Settings(),
        market_repo=MarketRepository(),
        virtual_portfolio_service=VirtualPortfolioService(
            market_repo=MarketRepository(),
            repo=VirtualPortfolioRepository(),
        ),
        ppr_repo=PortfolioPositionRecommendationRepository(),
        tinkoff_client=None,
    )
    positions = [
        {
            "figi": "F",
            "ticker": "TST",
            "quantity": 1.0,
            "averagePurchasePrice": 10.0,
            "currentPrice": 11.0,
            "currency": "RUB",
            "unrealizedPnlAbs": 1.0,
            "unrealizedPnlPct": 10.0,
            "weightInNavPct": 5.0,
            "sector": None,
        }
    ]
    p = svc.build_verdict_prompt(
        portfolio_scope=virtual_scope("moderate"),
        positions=positions,
        portfolio_meta={"totalValue": 100.0},
        market_by_figi={"F": {"recommendation": "BUY", "score": 0.7, "confidence": 0.6}},
    )
    assert "F" in p
    assert "averagePurchasePrice" in p or "10" in p
