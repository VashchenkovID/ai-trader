"""
Адаптер для официального клиента T‑Invest (gRPC), tinkoff-invest-python — Фаза F (опционально).

Сейчас приложение использует REST ([app.services.tinkoff_client]). Установка:

    pip install tinkoff-invest-python
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def tinkoff_invest_available() -> bool:
    try:
        import tinkoff.invest  # noqa: F401

        return True
    except ImportError:
        return False


def client_factory(token: str) -> Any | None:
    """Возвращает контекстный менеджер Client(token) или None, если пакет не установлен."""
    try:
        from tinkoff.invest import Client
    except ImportError:
        return None
    return Client(token)


def _quotation_to_float(q: Any) -> float:
    if q is None:
        return 0.0
    units = getattr(q, "units", None)
    nano = getattr(q, "nano", None)
    if units is None and nano is None and isinstance(q, dict):
        units = q.get("units", 0)
        nano = q.get("nano", 0)
    try:
        u = int(units) if units is not None else 0
        n = int(nano) if nano is not None else 0
        return float(u) + float(n) / 1e9
    except (TypeError, ValueError):
        return 0.0


def get_last_prices_grpc(token: str, figi_list: list[str]) -> dict[str, Any] | None:
    """
    GetLastPrices через gRPC; ответ в форме, близкой к REST: { lastPrices: [ { figi, price: {units,nano} } ] }.
    """
    if not figi_list or not tinkoff_invest_available():
        return None
    cm = client_factory(token)
    if cm is None:
        return None
    try:
        with cm as client:
            md = client.market_data
            resp = md.get_last_prices(figi=figi_list)
    except Exception as e:
        logger.warning("gRPC GetLastPrices failed: %s", e)
        return None
    last_prices: list[dict[str, Any]] = []
    for lp in getattr(resp, "last_prices", []) or []:
        figi = str(getattr(lp, "figi", "") or "")
        p = getattr(lp, "price", None)
        last_prices.append(
            {
                "figi": figi,
                "price": {
                    "units": int(getattr(p, "units", 0) or 0) if p is not None else 0,
                    "nano": int(getattr(p, "nano", 0) or 0) if p is not None else 0,
                },
                "priceFloat": _quotation_to_float(p),
            }
        )
    return {"lastPrices": last_prices, "_transport": "grpc"}


def get_portfolio_grpc(token: str, account_id: str) -> dict[str, Any] | None:
    """
    GetPortfolio через gRPC (read-only). Возвращает словарь в форме, совместимой с REST JSON,
    либо None при ошибке / отсутствии protobuf.
    """
    if not account_id or not tinkoff_invest_available():
        return None
    cm = client_factory(token)
    if cm is None:
        return None
    try:
        from google.protobuf.json_format import MessageToDict
    except ImportError:
        logger.warning("get_portfolio_grpc: google.protobuf not available")
        return None
    try:
        with cm as client:
            resp = client.operations.get_portfolio(account_id=account_id)
        data = MessageToDict(resp, preserving_proto_field_name=True)
    except Exception as e:
        logger.warning("gRPC GetPortfolio failed: %s", e)
        return None
    return {**data, "_transport": "grpc"}


def get_positions_grpc(token: str, account_id: str) -> dict[str, Any] | None:
    """GetPositions через gRPC; словарь в форме, близкой к REST."""
    if not account_id or not tinkoff_invest_available():
        return None
    cm = client_factory(token)
    if cm is None:
        return None
    try:
        from google.protobuf.json_format import MessageToDict
    except ImportError:
        return None
    try:
        with cm as client:
            resp = client.operations.get_positions(account_id=account_id)
        data = MessageToDict(resp, preserving_proto_field_name=True)
    except Exception as e:
        logger.warning("gRPC GetPositions failed: %s", e)
        return None
    return {**data, "_transport": "grpc"}
