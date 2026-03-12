import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_market_endpoints_v1(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/market/instruments")
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    instruments = resp.json()["data"]["items"]
    assert isinstance(instruments, list)

    if instruments:
        figi = instruments[0]["figi"]
        stock = await client.get(f"/api/v1/market/stock/{figi}")
        candles = await client.get(f"/api/v1/market/stock/{figi}/candles", params={"limit": 10})
        assert stock.status_code == 200
        assert candles.status_code == 200
        assert isinstance(candles.json()["data"]["items"], list)


@pytest.mark.asyncio
async def test_news_endpoints(client: AsyncClient) -> None:
    status = await client.get("/api/v1/news/status")
    by_figi = await client.get("/api/v1/news/BBG004730N88", params={"limit": 5, "days": 7})

    assert status.status_code == 200
    assert status.json()["success"] is True
    assert by_figi.status_code == 200
    body = by_figi.json()
    assert body["success"] is True
    assert isinstance(body["data"]["items"], list)
    assert len(body["data"]["items"]) <= 5


@pytest.mark.asyncio
async def test_performance_and_profitability_endpoints(client: AsyncClient) -> None:
    sector = await client.get("/api/v1/performance/sector-analysis", params={"days": 30})
    dashboard = await client.get("/api/v1/performance/visualization/dashboard")
    profitability = await client.get("/api/v1/profitability/report")

    assert sector.status_code == 200
    assert dashboard.status_code == 200
    assert profitability.status_code == 200
    assert sector.json()["success"] is True
    assert dashboard.json()["success"] is True
    assert profitability.json()["success"] is True
