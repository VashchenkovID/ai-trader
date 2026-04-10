from __future__ import annotations

from app.schemas.portfolio_profile import PortfolioProfileConfig
from app.services.portfolio_profile_config_service import PortfolioProfileConfigService
from app.services.settings_service import SettingsService
from app.services.virtual_portfolio_metrics import compute_trade_metrics


def test_portfolio_profile_defaults_merge() -> None:
    ss = SettingsService()
    svc = PortfolioProfileConfigService(ss)
    c = svc.get_config("conservative")
    assert isinstance(c, PortfolioProfileConfig)
    assert c.signal_min_score >= 0.65
    assert c.max_position_fraction <= 0.05


def test_portfolio_profile_override_from_settings() -> None:
    ss = SettingsService()
    ss.update(
        "portfolio.profiles",
        {"conservative": {"signal_min_score": 0.99, "max_position_fraction": 0.01}},
    )
    svc = PortfolioProfileConfigService(ss)
    c = svc.get_config("conservative")
    assert c.signal_min_score == 0.99
    assert c.max_position_fraction == 0.01


def test_trade_metrics_empty() -> None:
    m = compute_trade_metrics(trades=[], initial_capital=1000.0, total_value=1000.0)
    assert m["nTrades"] == 0
    assert m["totalReturnPct"] == 0.0


def test_trade_metrics_buy_sell_win() -> None:
    trades = [
        {
            "figi": "F1",
            "action": "BUY",
            "quantity": 10,
            "amount": 1000.0,
            "at": "2026-01-01T10:00:00",
        },
        {
            "figi": "F1",
            "action": "SELL",
            "quantity": 10,
            "amount": 1100.0,
            "at": "2026-01-02T10:00:00",
        },
    ]
    m = compute_trade_metrics(trades=trades, initial_capital=10_000.0, total_value=10_100.0)
    assert m["nTrades"] == 2
    assert m["winRatePct"] == 100.0
