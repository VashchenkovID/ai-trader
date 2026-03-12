from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_container
from app.core.errors import AppError
from app.schemas.envelope import SuccessEnvelope
from app.services.container import AppContainer

router = APIRouter(prefix="/tinkoff", tags=["tinkoff"])


def _client(container: AppContainer):
    if not container.tinkoff_client:
        raise AppError("SERVICE_UNAVAILABLE", message="Tinkoff client is not configured")
    return container.tinkoff_client


@router.get("/accounts")
async def accounts(container: AppContainer = Depends(get_container)) -> SuccessEnvelope[dict[str, Any]]:
    client = _client(container)
    return SuccessEnvelope(data=await asyncio.to_thread(client.get_accounts))


@router.get("/user-info")
async def user_info(container: AppContainer = Depends(get_container)) -> SuccessEnvelope[dict[str, Any]]:
    client = _client(container)
    return SuccessEnvelope(data=await asyncio.to_thread(client.get_user_info))


@router.get("/operations")
async def operations(
    from_ts: str | None = Query(None),
    to_ts: str | None = Query(None),
    state: str = Query("OPERATION_STATE_EXECUTED"),
    account_id: str | None = Query(None),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict[str, Any]]:
    client = _client(container)
    return SuccessEnvelope(
        data=await asyncio.to_thread(
            lambda: client.get_operations(
                account_id=account_id,
                from_ts=from_ts,
                to_ts=to_ts,
                state=state,
            )
        )
    )


@router.get("/instruments/currencies")
async def currencies(container: AppContainer = Depends(get_container)) -> SuccessEnvelope[dict[str, Any]]:
    client = _client(container)
    return SuccessEnvelope(data=await asyncio.to_thread(client.get_currencies))


@router.get("/instruments/bonds")
async def bonds(container: AppContainer = Depends(get_container)) -> SuccessEnvelope[dict[str, Any]]:
    client = _client(container)
    return SuccessEnvelope(data=await asyncio.to_thread(client.get_bonds))


@router.get("/instruments/etfs")
async def etfs(container: AppContainer = Depends(get_container)) -> SuccessEnvelope[dict[str, Any]]:
    client = _client(container)
    return SuccessEnvelope(data=await asyncio.to_thread(client.get_etfs))


@router.get("/instruments/dividends/{figi}")
async def dividends(figi: str, container: AppContainer = Depends(get_container)) -> SuccessEnvelope[dict[str, Any]]:
    client = _client(container)
    return SuccessEnvelope(data=await asyncio.to_thread(client.get_dividends, figi))


@router.get("/instruments/find")
async def find_instrument(
    query: str = Query(..., min_length=1),
    container: AppContainer = Depends(get_container),
) -> SuccessEnvelope[dict[str, Any]]:
    client = _client(container)
    return SuccessEnvelope(data=await asyncio.to_thread(client.find_instrument, query))


@router.get("/trading-status/{figi}")
async def trading_status(figi: str, container: AppContainer = Depends(get_container)) -> SuccessEnvelope[dict[str, Any]]:
    client = _client(container)
    return SuccessEnvelope(data=await asyncio.to_thread(client.get_trading_status, figi))
