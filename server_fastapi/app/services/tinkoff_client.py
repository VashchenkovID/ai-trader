"""
Клиент Tinkoff Invest API (Фаза 5).

Синхронные вызовы REST API с повторными попытками при 429/5xx.
Используется эндпоинтами портфеля и планировщиком задач обновления БД.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# Интервалы свечей Tinkoff API
CANDLE_INTERVAL_DAY = "CANDLE_INTERVAL_DAY"
CANDLE_INTERVAL_HOUR = "CANDLE_INTERVAL_HOUR"
CANDLE_INTERVAL_15_MIN = "CANDLE_INTERVAL_15_MINUTE"

RETRY_STATUS_CODES = (429, 500, 502, 503, 504)
MAX_RETRIES = 5
INITIAL_DELAY = 1.0
MAX_DELAY = 15.0
EXPONENTIAL_BASE = 1.5
REQUEST_DELAY = 0.5


def _to_iso8601_utc(value: str | datetime) -> str:
    if isinstance(value, datetime):
        dt = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return value


def _is_ssl_verify_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return "certificate verify failed" in text or "certificate_verify_failed" in text


def price_units_nano_to_float(units: int | str | None, nano: int | None = None) -> float:
    """
    Конвертация цены из формата Tinkoff API (units + nano) в float.
    Если передан один аргумент — объект с полями units и nano.
    """
    if units is None and nano is None:
        return 0.0
    if isinstance(units, dict):
        u = units.get("units") or 0
        n = units.get("nano") or 0
        return float(u) + float(n) / 1e9
    u = float(units or 0)
    n = float(nano or 0)
    return u + n / 1e9


class TinkoffApiError(Exception):
    """Ошибка вызова Tinkoff Invest API."""

    def __init__(self, message: str, status_code: int | None = None, details: str = "") -> None:
        super().__init__(message)
        self.status_code = status_code
        self.details = details


class TinkoffApiClient:
    """
    Синхронный клиент Tinkoff Invest API.
    Поддерживает GetLastPrices, GetCandles, GetInstrumentBy, GetPortfolio, GetPositions, PostOrder.
    """

    def __init__(
        self,
        base_url: str,
        token: str,
        account_id: str = "",
        verify_ssl: bool = True,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.account_id = account_id or ""
        self.verify_ssl = verify_ssl
        self._last_request_time = 0.0

    def _delay_if_needed(self) -> None:
        elapsed = time.monotonic() - self._last_request_time
        if elapsed < REQUEST_DELAY:
            time.sleep(REQUEST_DELAY - elapsed)

    def _request(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        """
        Выполняет POST-запрос к API с повторными попытками при 429/5xx.
        """
        url = f"{self.base_url}{path}"
        timeout = 60.0 if "/Shares" in path or "InstrumentsService" in path else 30.0
        last_error: Exception | None = None
        current_verify = self.verify_ssl
        insecure_fallback_used = False

        for attempt in range(MAX_RETRIES):
            self._delay_if_needed()
            self._last_request_time = time.monotonic()
            try:
                with httpx.Client(timeout=timeout, verify=current_verify) as client:
                    response = client.post(
                        url,
                        json=body,
                        headers={
                            "Authorization": f"Bearer {self.token}",
                            "Content-Type": "application/json",
                        },
                    )
                if response.status_code == 404:
                    if "GetInstrumentBy" in path:
                        raise TinkoffApiError("Not found", status_code=404)
                    logger.warning("Tinkoff API 404: %s %s", path, response.text[:200])
                    response.raise_for_status()
                if response.is_success:
                    return response.json()
                if response.status_code not in RETRY_STATUS_CODES:
                    response.raise_for_status()
                last_error = TinkoffApiError(
                    f"HTTP {response.status_code}",
                    status_code=response.status_code,
                    details=response.text[:500],
                )
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404 and "GetInstrumentBy" in path:
                    raise TinkoffApiError("Not found", status_code=404)
                last_error = e
            except (httpx.ConnectError, httpx.TimeoutException) as e:
                last_error = e
                if current_verify and not insecure_fallback_used and _is_ssl_verify_error(e):
                    insecure_fallback_used = True
                    current_verify = False
                    logger.warning(
                        "SSL verify failed for %s; retrying with verify=False",
                        path,
                    )
                    continue

            if attempt < MAX_RETRIES - 1:
                delay = min(INITIAL_DELAY * (EXPONENTIAL_BASE**attempt), MAX_DELAY)
                logger.info("Tinkoff API retry in %.1fs (attempt %d/%d)", delay, attempt + 1, MAX_RETRIES)
                time.sleep(delay)

        if last_error:
            logger.error(
                "Tinkoff API request failed: path=%s error_type=%s error=%s",
                path,
                last_error.__class__.__name__,
                str(last_error),
            )
            raise last_error
        logger.error("Tinkoff API request failed without captured error: path=%s", path)
        raise TinkoffApiError("Request failed after retries")

    def get_last_prices(self, figi_list: list[str]) -> dict[str, Any]:
        """Последние цены по списку FIGI."""
        if not figi_list:
            return {"lastPrices": []}
        try:
            return self._request(
                "/tinkoff.public.invest.api.contract.v1.MarketDataService/GetLastPrices",
                {"figi": figi_list},
            )
        except Exception as e:
            logger.exception("get_last_prices failed: %s", e)
            return {
                "lastPrices": [],
                "_degraded": True,
                "_error": str(e),
                "_error_type": e.__class__.__name__,
                "_operation": "get_last_prices",
            }

    def get_assets(self) -> dict[str, Any]:
        """
        Расширенный список активов/инструментов.
        Для совместимости c fallback используем Shares.
        """
        try:
            return self._request(
                "/tinkoff.public.invest.api.contract.v1.InstrumentsService/GetAssets",
                {"instrumentStatus": "INSTRUMENT_STATUS_BASE"},
            )
        except Exception as e:
            logger.exception("get_assets failed: %s", e)
            # Не все тарифы/версии API поддерживают Assets endpoint.
            shares = self.get_shares()
            return {"assets": shares.get("instruments") or []}

    def get_options(self) -> dict[str, Any]:
        """Список опционных инструментов (если поддерживается API)."""
        try:
            return self._request(
                "/tinkoff.public.invest.api.contract.v1.InstrumentsService/Options",
                {"instrumentStatus": "INSTRUMENT_STATUS_BASE"},
            )
        except Exception as e:
            logger.warning("get_options failed: %s", e)
            return {"instruments": []}

    def get_analyst_signals(self) -> dict[str, Any]:
        """Сигналы аналитиков/стратегий (если доступны в API)."""
        candidates: list[tuple[str, dict[str, Any]]] = [
            # Каноничный путь по документации T-Bank и legacy Node-серверу.
            ("/tinkoff.public.invest.api.contract.v1.SignalService/GetSignals", {"limit": 100}),
            # Legacy fallback для окружений со старым контрактом.
            ("/tinkoff.public.invest.api.contract.v1.AnalyticsService/GetAnalystRecommendations", {}),
        ]
        for path, body in candidates:
            try:
                payload = self._request(path, body)
                signals = payload.get("signals")
                if isinstance(signals, list):
                    return {"signals": signals}
                recommendations = payload.get("recommendations")
                if isinstance(recommendations, list):
                    return {"signals": recommendations}
                analyst_recommendations = payload.get("analystRecommendations")
                if isinstance(analyst_recommendations, list):
                    return {"signals": analyst_recommendations}
                items = payload.get("items")
                if isinstance(items, list):
                    return {"signals": items}
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    logger.warning("Tinkoff API 404: %s", path)
                    continue
                logger.warning("get_analyst_signals failed via %s: %s", path, e)
            except Exception as e:
                logger.warning("get_analyst_signals failed via %s: %s", path, e)
        return {"signals": []}

    def get_candles(
        self,
        figi: str,
        from_ts: str | datetime,
        to_ts: str | datetime,
        interval: str = "DAY",
    ) -> dict[str, Any]:
        """Исторические свечи. from_ts, to_ts — ISO 8601."""
        interval_val = f"CANDLE_INTERVAL_{interval}" if not interval.startswith("CANDLE_") else interval
        from_iso = _to_iso8601_utc(from_ts)
        to_iso = _to_iso8601_utc(to_ts)
        path = "/tinkoff.public.invest.api.contract.v1.MarketDataService/GetCandles"
        try:
            # По актуальной документации T-Bank используется поле instrumentId.
            return self._request(
                path,
                {"instrumentId": figi, "from": from_iso, "to": to_iso, "interval": interval_val},
            )
        except httpx.HTTPStatusError as e:
            # Fallback для старых контрактов/проксей, где ждут поле figi.
            if e.response is not None and e.response.status_code == 400:
                return self._request(
                    path,
                    {"figi": figi, "from": from_iso, "to": to_iso, "interval": interval_val},
                )
            raise

    def get_shares(self) -> dict[str, Any]:
        """Список акций (InstrumentsService/Shares). Для задачи обновления инструментов."""
        return self._request(
            "/tinkoff.public.invest.api.contract.v1.InstrumentsService/Shares",
            {"instrumentStatus": "INSTRUMENT_STATUS_BASE"},
        )

    def get_instrument_by_figi(self, figi: str) -> dict[str, Any] | None:
        """Инструмент по FIGI. При 404 возвращает None."""
        try:
            return self._request(
                "/tinkoff.public.invest.api.contract.v1.InstrumentsService/GetInstrumentBy",
                {"id": figi, "idType": "INSTRUMENT_ID_TYPE_FIGI"},
            )
        except TinkoffApiError as e:
            if e.status_code == 404:
                return None
            raise
        except Exception:
            raise

    def get_portfolio(self, account_id: str | None = None) -> dict[str, Any]:
        """Портфель счёта. Нормализованная структура для фронта."""
        aid = account_id or self.account_id
        if not aid:
            return self._empty_portfolio()
        try:
            data = self._request(
                "/tinkoff.public.invest.api.contract.v1.OperationsService/GetPortfolio",
                {"accountId": aid},
            )
            return self._normalize_portfolio(data)
        except Exception as e:
            logger.exception("get_portfolio failed: %s", e)
            empty = self._empty_portfolio()
            empty["_degraded"] = True
            empty["_error"] = str(e)
            empty["_error_type"] = e.__class__.__name__
            empty["_operation"] = "get_portfolio"
            return empty

    def get_positions(self, account_id: str | None = None) -> dict[str, Any]:
        """Позиции и денежные средства счёта."""
        aid = account_id or self.account_id
        if not aid:
            return {"positions": [], "money": [], "blocked": []}
        try:
            data = self._request(
                "/tinkoff.public.invest.api.contract.v1.OperationsService/GetPositions",
                {"accountId": aid},
            )
            return self._normalize_positions(data)
        except Exception as e:
            logger.exception("get_positions failed: %s", e)
            return {
                "positions": [],
                "money": [],
                "blocked": [],
                "_degraded": True,
                "_error": str(e),
                "_error_type": e.__class__.__name__,
                "_operation": "get_positions",
            }

    def get_operations(
        self,
        account_id: str | None = None,
        from_ts: str | None = None,
        to_ts: str | None = None,
        state: str = "OPERATION_STATE_EXECUTED",
    ) -> dict[str, Any]:
        """История операций счета за период."""
        aid = account_id or self.account_id
        body: dict[str, Any] = {"accountId": aid, "state": state}
        if from_ts:
            body["from"] = from_ts
        if to_ts:
            body["to"] = to_ts
        return self._request(
            "/tinkoff.public.invest.api.contract.v1.OperationsService/GetOperations",
            body,
        )

    def get_accounts(self) -> dict[str, Any]:
        """Список счетов пользователя."""
        return self._request(
            "/tinkoff.public.invest.api.contract.v1.UsersService/GetAccounts",
            {},
        )

    def get_user_info(self) -> dict[str, Any]:
        """Профиль пользователя Tinkoff Invest."""
        return self._request(
            "/tinkoff.public.invest.api.contract.v1.UsersService/GetInfo",
            {},
        )

    def get_currencies(self) -> dict[str, Any]:
        """Справочник валют."""
        return self._request(
            "/tinkoff.public.invest.api.contract.v1.InstrumentsService/Currencies",
            {"instrumentStatus": "INSTRUMENT_STATUS_BASE"},
        )

    def get_bonds(self) -> dict[str, Any]:
        """Справочник облигаций."""
        return self._request(
            "/tinkoff.public.invest.api.contract.v1.InstrumentsService/Bonds",
            {"instrumentStatus": "INSTRUMENT_STATUS_BASE"},
        )

    def get_etfs(self) -> dict[str, Any]:
        """Справочник ETF."""
        return self._request(
            "/tinkoff.public.invest.api.contract.v1.InstrumentsService/Etfs",
            {"instrumentStatus": "INSTRUMENT_STATUS_BASE"},
        )

    def get_dividends(self, figi: str) -> dict[str, Any]:
        """История дивидендов по инструменту."""
        return self._request(
            "/tinkoff.public.invest.api.contract.v1.InstrumentsService/GetDividends",
            {"instrumentId": figi, "idType": "INSTRUMENT_ID_TYPE_FIGI"},
        )

    def find_instrument(self, query: str) -> dict[str, Any]:
        """Поиск инструмента по тикеру/имени."""
        return self._request(
            "/tinkoff.public.invest.api.contract.v1.InstrumentsService/FindInstrument",
            {"query": query},
        )

    def get_trading_schedules(self, exchange: str, from_ts: str, to_ts: str) -> dict[str, Any]:
        """Торговые расписания биржи на период."""
        return self._request(
            "/tinkoff.public.invest.api.contract.v1.InstrumentsService/TradingSchedules",
            {"exchange": exchange, "from": from_ts, "to": to_ts},
        )

    def get_trading_status(self, figi: str) -> dict[str, Any]:
        """Текущий торговый статус инструмента."""
        return self._request(
            "/tinkoff.public.invest.api.contract.v1.MarketDataService/GetTradingStatus",
            {"figi": figi},
        )

    def get_options_by(
        self,
        *,
        basic_asset_uid: str | None = None,
        basic_asset_position_uid: str | None = None,
        basic_instrument_id: str | None = None,
    ) -> dict[str, Any]:
        """Список опционов по базовому активу."""
        body: dict[str, Any] = {}
        if basic_asset_uid:
            body["basicAssetUid"] = basic_asset_uid
        if basic_asset_position_uid:
            body["basicAssetPositionUid"] = basic_asset_position_uid
        if basic_instrument_id:
            body["basicInstrumentId"] = basic_instrument_id
        return self._request(
            "/tinkoff.public.invest.api.contract.v1.InstrumentsService/OptionsBy",
            body,
        )

    def get_asset_fundamentals(self, asset_identifiers: list[str]) -> dict[str, Any]:
        """Фундаментальные показатели по asset_uid."""
        return self._request(
            "/tinkoff.public.invest.api.contract.v1.InstrumentsService/GetAssetFundamentals",
            {"assets": asset_identifiers},
        )

    def calculate_commission(
        self,
        price: float,
        quantity: float,
        instrument_type: str = "stock",
    ) -> dict[str, Any]:
        """Расчёт комиссии (0.3%, мин 1 RUB). Без вызова API."""
        rate = 0.003
        min_commission = 1.0
        deal_amount = price * quantity
        commission = max(deal_amount * rate, min_commission)
        return {
            "amount": commission,
            "currency": "RUB",
            "rate": rate,
            "dealAmount": deal_amount,
        }

    @staticmethod
    def _empty_portfolio() -> dict[str, Any]:
        return {
            "totalAmountPortfolio": {"value": 0, "currency": "RUB"},
            "totalAmountCurrencies": [],
            "expectedYield": {"value": 0, "currency": "RUB"},
            "expectedYieldCurrencies": [],
            "positions": [],
        }

    @staticmethod
    def _normalize_portfolio(data: dict[str, Any]) -> dict[str, Any]:
        """Нормализация ответа GetPortfolio в плоский вид."""
        def val_cur(obj: Any) -> tuple[float, str]:
            if obj is None:
                return 0.0, "RUB"
            if isinstance(obj, dict):
                u = obj.get("units")
                if u is None:
                    return 0.0, str(obj.get("currency", "RUB"))
                return float(u) + float(obj.get("nano") or 0) / 1e9, str(obj.get("currency", "RUB"))
            return float(obj), "RUB"

        total_val, total_cur = val_cur(data.get("totalAmountPortfolio"))
        exp_val, exp_cur = val_cur(data.get("expectedYield"))
        positions = []
        for p in data.get("positions") or []:
            qty = p.get("quantity") or {}
            q = int(qty.get("units", 0)) if isinstance(qty, dict) else int(qty or 0)
            avg = val_cur(p.get("averagePositionPrice"))[0]
            cur_p = val_cur(p.get("currentPrice"))[0]
            exp_y = val_cur(p.get("expectedYield"))[0]
            it = p.get("instrumentType")
            instrument_type = it if isinstance(it, str) else (getattr(it, "name", None) if it is not None else "share") or "share"
            ticker = p.get("ticker") or ""
            positions.append({
                "figi": p.get("figi"),
                "ticker": ticker,
                "instrumentType": instrument_type,
                "quantity": q,
                "averagePositionPrice": {"value": avg, "currency": "RUB"},
                "expectedYield": {"value": exp_y, "currency": "RUB"},
                "currentPrice": {"value": cur_p, "currency": "RUB"},
            })
        return {
            "totalAmountPortfolio": {"value": total_val, "currency": total_cur},
            "totalAmountCurrencies": data.get("totalAmountCurrencies") or [],
            "expectedYield": {"value": exp_val, "currency": exp_cur},
            "expectedYieldCurrencies": data.get("expectedYieldCurrencies") or [],
            "positions": positions,
        }

    @staticmethod
    def _normalize_positions(data: dict[str, Any]) -> dict[str, Any]:
        """Нормализация ответа GetPositions."""
        positions = []
        for p in data.get("positions") or []:
            qty = p.get("quantity") or {}
            q = int(qty.get("units", 0)) if isinstance(qty, dict) else int(qty or 0)
            avg = p.get("averagePositionPrice") or {}
            cur_p = p.get("currentPrice") or {}
            it = p.get("instrumentType")
            instrument_type = it if isinstance(it, str) else (getattr(it, "name", None) if it is not None else "share") or "share"
            positions.append({
                "figi": p.get("figi"),
                "instrumentType": instrument_type,
                "quantity": q,
                "averagePositionPrice": {"value": price_units_nano_to_float(avg), "currency": (avg or {}).get("currency", "RUB")},
                "currentPrice": {"value": price_units_nano_to_float(cur_p), "currency": (cur_p or {}).get("currency", "RUB")},
                "expectedYield": p.get("expectedYield"),
            })
        money = [{"value": price_units_nano_to_float(m), "currency": (m or {}).get("currency", "RUB")} for m in (data.get("money") or [])]
        blocked = data.get("blocked") or []
        return {"positions": positions, "money": money, "blocked": blocked}
