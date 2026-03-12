"""Unit-тесты клиента Tinkoff Invest API (Фаза 5)."""

import pytest
from unittest.mock import MagicMock, patch

from app.services.tinkoff_client import (
    TinkoffApiClient,
    TinkoffApiError,
    price_units_nano_to_float,
)


class TestPriceUnitsNanoToFloat:
    def test_units_and_nano(self):
        assert price_units_nano_to_float(10, 500_000_000) == pytest.approx(10.5)

    def test_units_only(self):
        assert price_units_nano_to_float(100, 0) == 100.0
        assert price_units_nano_to_float(100, None) == 100.0

    def test_dict_single_arg(self):
        assert price_units_nano_to_float({"units": 5, "nano": 300_000_000}) == pytest.approx(5.3)

    def test_none(self):
        assert price_units_nano_to_float(None, None) == 0.0


class TestCalculateCommission:
    def test_basic(self):
        client = TinkoffApiClient("https://api.test", "token", "acc")
        r = client.calculate_commission(100.0, 10.0)
        assert r["currency"] == "RUB"
        assert r["rate"] == 0.003
        assert r["dealAmount"] == 1000.0
        assert r["amount"] == 3.0

    def test_min_commission(self):
        client = TinkoffApiClient("https://api.test", "token", "acc")
        r = client.calculate_commission(1.0, 1.0)
        assert r["amount"] == 1.0


class TestTinkoffApiClientRequest:
    @patch("app.services.tinkoff_client.httpx.Client")
    def test_get_last_prices_ok(self, mock_client_class):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {"lastPrices": [{"figi": "F1", "price": {"units": "100", "nano": 0}}]}
        mock_client = MagicMock()
        mock_client.post.return_value = mock_response
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client_class.return_value = mock_client

        client = TinkoffApiClient("https://api.test", "token", "acc")
        out = client.get_last_prices(["F1"])
        assert out["lastPrices"]
        assert out["lastPrices"][0]["figi"] == "F1"

    @patch("app.services.tinkoff_client.httpx.Client")
    def test_get_last_prices_empty_list(self, mock_client_class):
        client = TinkoffApiClient("https://api.test", "token", "acc")
        out = client.get_last_prices([])
        assert out == {"lastPrices": []}
        mock_client_class.assert_not_called()

    @patch("app.services.tinkoff_client.httpx.Client")
    def test_get_portfolio_no_account(self, mock_client_class):
        client = TinkoffApiClient("https://api.test", "token", "")
        out = client.get_portfolio()
        assert "positions" in out
        assert out["totalAmountPortfolio"]["value"] == 0
        mock_client_class.assert_not_called()

    @patch("app.services.tinkoff_client.httpx.Client")
    def test_get_portfolio_ok(self, mock_client_class):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.json.return_value = {
            "totalAmountPortfolio": {"units": "100000", "nano": 0, "currency": "RUB"},
            "expectedYield": {"units": "0", "nano": 0, "currency": "RUB"},
            "totalAmountCurrencies": [],
            "expectedYieldCurrencies": [],
            "positions": [
                {
                    "figi": "F1",
                    "ticker": "SBER",
                    "instrumentType": "share",
                    "quantity": {"units": "10", "nano": 0},
                    "averagePositionPrice": {"units": "250", "nano": 0, "currency": "RUB"},
                    "currentPrice": {"units": "260", "nano": 0, "currency": "RUB"},
                    "expectedYield": {"units": "100", "nano": 0, "currency": "RUB"},
                }
            ],
        }
        mock_client = MagicMock()
        mock_client.post.return_value = mock_response
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client_class.return_value = mock_client

        client = TinkoffApiClient("https://api.test", "token", "acc1")
        out = client.get_portfolio(account_id="acc1")
        assert out["totalAmountPortfolio"]["value"] == 100_000.0
        assert len(out["positions"]) == 1
        assert out["positions"][0]["figi"] == "F1"
        assert out["positions"][0]["quantity"] == 10

    @patch("app.services.tinkoff_client.httpx.Client")
    def test_get_instrument_by_figi_404_returns_none(self, mock_client_class):
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_client = MagicMock()
        mock_client.post.return_value = mock_response
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client_class.return_value = mock_client

        client = TinkoffApiClient("https://api.test", "token", "acc")
        result = client.get_instrument_by_figi("UNKNOWN")
        assert result is None
