import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_demo_error_returns_target_error_envelope(client: AsyncClient) -> None:
    response = await client.get("/api/v1/errors/demo", params={"code": "INVALID_STATE_TRANSITION"})

    assert response.status_code == 409
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INVALID_STATE_TRANSITION"
    assert body["error"]["message"] == "Invalid state transition"
    assert body["error"]["traceId"] is not None


@pytest.mark.asyncio
async def test_validation_error_returns_bad_request(client: AsyncClient) -> None:
    response = await client.get("/api/v1/errors/demo", params={"code": "x"})

    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "BAD_REQUEST"
