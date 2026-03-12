from __future__ import annotations

from datetime import datetime, timedelta

import httpx
import pytest

from app.core.config import get_settings
from app.services.tinkoff_client import TinkoffApiClient


def _build_live_client() -> TinkoffApiClient:
    settings = get_settings()
    token = (settings.tinkoff_token or "").strip()
    if not token:
        pytest.skip("TINKOFF_TOKEN is not configured")
    return TinkoffApiClient(
        base_url=settings.tinkoff_api_url,
        token=token,
        account_id=settings.tinkoff_account_id,
        verify_ssl=settings.tinkoff_verify_ssl,
    )


def _skip_on_transient(exc: Exception) -> None:
    text = str(exc).lower()
    if isinstance(exc, (httpx.ConnectError, httpx.TimeoutException)) or "temporarily unavailable" in text:
        pytest.skip(f"Tinkoff API temporary/network issue: {exc}")
    raise exc


@pytest.mark.live_tinkoff
def test_live_tinkoff_get_accounts() -> None:
    client = _build_live_client()
    try:
        data = client.get_accounts()
    except Exception as exc:
        _skip_on_transient(exc)
    assert isinstance(data, dict)
    accounts = data.get("accounts") or []
    assert isinstance(accounts, list)
    assert len(accounts) >= 1


@pytest.mark.live_tinkoff
def test_live_tinkoff_portfolio_and_positions() -> None:
    client = _build_live_client()
    if not (client.account_id or "").strip():
        pytest.skip("TINKOFF_ACCOUNT_ID is not configured for portfolio/positions")
    try:
        portfolio = client.get_portfolio()
        positions = client.get_positions()
    except Exception as exc:
        _skip_on_transient(exc)
    assert isinstance(portfolio, dict)
    assert "positions" in portfolio
    assert isinstance(portfolio.get("positions"), list)
    assert isinstance(positions, dict)
    assert isinstance(positions.get("positions") or [], list)
    assert isinstance(positions.get("money") or [], list)


@pytest.mark.live_tinkoff
def test_live_tinkoff_get_last_prices() -> None:
    client = _build_live_client()
    figis: list[str] = []
    if (client.account_id or "").strip():
        try:
            pf = client.get_portfolio()
            figis = [p.get("figi") for p in (pf.get("positions") or []) if p.get("figi")]
        except Exception as exc:
            _skip_on_transient(exc)
    if not figis:
        try:
            shares = client.get_shares().get("instruments") or []
        except Exception as exc:
            _skip_on_transient(exc)
        figis = [s.get("figi") for s in shares[:5] if s.get("figi")]
    if not figis:
        pytest.skip("No FIGI available for live last prices test")
    try:
        data = client.get_last_prices(figis)
    except Exception as exc:
        _skip_on_transient(exc)
    assert isinstance(data, dict)
    assert "lastPrices" in data
    assert isinstance(data.get("lastPrices"), list)


@pytest.mark.live_tinkoff
def test_live_tinkoff_surface_readonly_methods() -> None:
    client = _build_live_client()
    try:
        shares = client.get_shares()
        currencies = client.get_currencies()
        etfs = client.get_etfs()
        bonds = client.get_bonds()
        found = client.find_instrument("SBER")
    except Exception as exc:
        _skip_on_transient(exc)

    assert isinstance(shares, dict)
    assert isinstance(currencies, dict)
    assert isinstance(etfs, dict)
    assert isinstance(bonds, dict)
    assert isinstance(found, dict)
    assert isinstance(shares.get("instruments") or [], list)


@pytest.mark.live_tinkoff
def test_live_tinkoff_get_operations_readonly() -> None:
    client = _build_live_client()
    if not (client.account_id or "").strip():
        pytest.skip("TINKOFF_ACCOUNT_ID is not configured for operations")
    now = datetime.utcnow()
    from_ts = (now - timedelta(days=14)).isoformat() + "Z"
    to_ts = now.isoformat() + "Z"
    try:
        data = client.get_operations(from_ts=from_ts, to_ts=to_ts)
    except Exception as exc:
        _skip_on_transient(exc)
    assert isinstance(data, dict)
    assert isinstance(data.get("operations") or [], list)
