import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_root_success_envelope(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["status"] == "ok"
    assert "X-Request-Id" in response.headers
    assert "X-Trace-Id" in response.headers


@pytest.mark.asyncio
async def test_health_v1_success_envelope(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["status"] == "ok"
