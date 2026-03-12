import pytest
from httpx import AsyncClient

from app.core.config import get_settings


@pytest.mark.asyncio
async def test_auth_login_and_me_compat(client: AsyncClient) -> None:
    settings = get_settings()
    password = settings.user_password or ""
    login_response = await client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": password},
    )
    if login_response.status_code == 503:
        pytest.skip("Auth storage unavailable in current test environment")
    assert login_response.status_code == 200
    login_body = login_response.json()
    assert login_body["success"] is True
    token = login_body["data"]["token"]

    me_response = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_response.status_code == 200
    me_body = me_response.json()
    assert me_body["success"] is True
    assert me_body["data"]["username"] == "admin"


@pytest.mark.asyncio
async def test_auth_unauthorized_error_contract(client: AsyncClient) -> None:
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_auth_verify_and_logout(client: AsyncClient) -> None:
    """Интеграционные тесты POST /auth/verify и POST /auth/logout."""
    settings = get_settings()
    password = settings.user_password or ""
    login_r = await client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": password},
    )
    if login_r.status_code == 503:
        pytest.skip("Auth storage unavailable in current test environment")
    assert login_r.status_code == 200
    token = login_r.json()["data"]["token"]

    verify_r = await client.post("/api/v1/auth/verify", json={"token": token})
    assert verify_r.status_code == 200
    verify_body = verify_r.json()
    assert verify_body["success"] is True
    assert verify_body["data"]["message"] == "Токен действителен"
    assert verify_body["data"]["user"]["username"] == "admin"

    logout_r = await client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert logout_r.status_code == 200
    assert logout_r.json()["data"]["message"] == "Выход выполнен успешно"


@pytest.mark.asyncio
async def test_settings_and_performance_aliases(client: AsyncClient) -> None:
    settings_response = await client.get("/api/v1/settings")
    assert settings_response.status_code == 200
    settings_body = settings_response.json()
    assert settings_body["success"] is True
    assert isinstance(settings_body["data"]["items"], list)
    assert "meta" in settings_body["data"]

    perf_response = await client.get("/api/v1/performance/metrics")
    assert perf_response.status_code == 200
    perf_body = perf_response.json()
    assert perf_body["success"] is True
    assert "responseTime" in perf_body["data"]

    v1_perf = await client.get("/api/v1/performance/metrics")
    assert v1_perf.status_code == 200
    assert v1_perf.json()["data"].keys() == perf_body["data"].keys()


@pytest.mark.asyncio
async def test_kelly_validation_error_code(client: AsyncClient) -> None:
    response = await client.put("/api/v1/settings/kelly", json={"conservativeFactor": 2})
    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "BAD_REQUEST"


@pytest.mark.asyncio
async def test_system_and_monitoring_routes(client: AsyncClient) -> None:
    system_response = await client.get("/api/v1/system/status")
    assert system_response.status_code == 200
    assert system_response.json()["success"] is True

    monitoring_response = await client.get("/api/v1/monitoring/metrics")
    assert monitoring_response.status_code == 200
    monitoring_body = monitoring_response.json()
    assert monitoring_body["success"] is True
    assert "routes" in monitoring_body["data"]

    baseline_response = await client.get("/api/v1/system/performance/baseline")
    assert baseline_response.status_code == 200
    baseline_body = baseline_response.json()
    assert baseline_body["success"] is True
    assert "targets" in baseline_body["data"]
