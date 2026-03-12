"""Расширенные тесты для максимального покрытия сервисов и API."""

from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.api.deps import get_bearer_token, get_container
from app.core.errors import AppError
from app.main import app
from app.services.auth_service import AuthService
from app.services.auto_paper_service import AutoPaperService
from app.services.recommendation_pipeline_service import RecommendationPipelineService
from app.services.risk_service import RiskService
from app.services.settings_service import SettingsService
from app.services.trading_mode_service import TradingModeService
from app.services.trading_request_service import TradingRequestService


def test_get_bearer_token_missing() -> None:
    with pytest.raises(AppError) as exc:
        get_bearer_token(None)
    assert exc.value.error_code == "UNAUTHORIZED"


def test_get_bearer_token_invalid_format() -> None:
    with pytest.raises(AppError) as exc:
        get_bearer_token("Basic abc")
    assert "Invalid" in str(exc.value.message)


def test_get_bearer_token_empty_token() -> None:
    with pytest.raises(AppError) as exc:
        get_bearer_token("Bearer ")
    assert "Invalid" in str(exc.value.message)


def test_get_bearer_token_ok() -> None:
    token = get_bearer_token("Bearer my-jwt-token")
    assert token == "my-jwt-token"


# --- RiskService ---


def test_risk_service_validate_action_invalid() -> None:
    settings = SettingsService()
    svc = RiskService(settings)
    r = svc.validate_order(
        figi="F1", action="HOLD", quantity=10, price=Decimal("100"),
        confidence=0.8, score=0.7,
    )
    assert r["isValid"] is False
    assert "BUY or SELL" in r["errors"][0]


def test_risk_service_validate_confidence_low() -> None:
    settings = SettingsService()
    svc = RiskService(settings)
    r = svc.validate_order(
        figi="F1", action="BUY", quantity=10, price=Decimal("100"),
        confidence=0.3, score=0.7,
    )
    assert r["isValid"] is False
    assert "40%" in r["errors"][0]


def test_risk_service_validate_confidence_warning() -> None:
    settings = SettingsService()
    svc = RiskService(settings)
    r = svc.validate_order(
        figi="F1", action="BUY", quantity=10, price=Decimal("100"),
        confidence=0.5, score=0.7,
    )
    assert r["isValid"] is True
    assert len(r["warnings"]) >= 1


def test_risk_service_validate_quantity_invalid() -> None:
    settings = SettingsService()
    svc = RiskService(settings)
    r = svc.validate_order(
        figi="F1", action="BUY", quantity=0, price=Decimal("100"),
        confidence=0.8, score=0.7,
    )
    assert r["isValid"] is False
    assert "quantity" in r["errors"][0].lower()


def test_risk_service_validate_price_invalid() -> None:
    settings = SettingsService()
    svc = RiskService(settings)
    r = svc.validate_order(
        figi="F1", action="BUY", quantity=10, price=Decimal("0"),
        confidence=0.8, score=0.7,
    )
    assert r["isValid"] is False
    assert "price" in r["errors"][0].lower()


def test_risk_service_validate_position_size_exceeded() -> None:
    settings = SettingsService()
    svc = RiskService(settings)
    r = svc.validate_order(
        figi="F1", action="BUY", quantity=10000, price=Decimal("1000"),
        confidence=0.8, score=0.7, portfolio_value=Decimal("1000000"),
    )
    assert r["isValid"] is False
    assert "превышает" in r["errors"][0]


def test_risk_service_validate_exposure_exceeded() -> None:
    settings = SettingsService()
    svc = RiskService(settings)
    r = svc.validate_order(
        figi="F1", action="BUY", quantity=500, price=Decimal("1000"),
        confidence=0.8, score=0.7,
        portfolio_value=Decimal("1000000"),
        current_exposure=Decimal("500000"),
    )
    assert r["isValid"] is False
    assert "экспозиц" in r["errors"][0].lower() or "превышает" in r["errors"][0]


def test_risk_service_update_limits() -> None:
    settings = SettingsService()
    svc = RiskService(settings)
    limits = svc.update_limits({"maxPositionSize": 0.1})
    assert limits["maxPositionSize"] == 0.1


def test_risk_service_get_limits_from_settings() -> None:
    settings = SettingsService()
    svc = RiskService(settings)
    svc.update_limits({"maxPositionSize": 0.02})
    limits = svc._get_limits()
    assert limits["maxPositionSize"] == 0.02


def test_risk_service_validate_daily_loss_exceeded() -> None:
    settings = SettingsService()
    svc = RiskService(settings)
    svc._stats["dailyPnL"] = -150000
    r = svc.validate_order(
        figi="F1", action="BUY", quantity=10, price=Decimal("100"),
        confidence=0.8, score=0.7, portfolio_value=Decimal("1000000"),
    )
    assert r["isValid"] is False
    assert any("убыток" in e.lower() for e in r["errors"])


def test_risk_service_validate_consecutive_losses_exceeded() -> None:
    settings = SettingsService()
    svc = RiskService(settings)
    svc._stats["consecutiveLosses"] = 10
    r = svc.validate_order(
        figi="F1", action="BUY", quantity=10, price=Decimal("100"),
        confidence=0.8, score=0.7,
    )
    assert r["isValid"] is False
    assert any("убытк" in e.lower() for e in r["errors"])


def test_risk_service_record_execution_result_updates_stats() -> None:
    settings = SettingsService()
    svc = RiskService(settings)
    svc.record_execution_result(pnl_delta=-100.0)
    svc.record_execution_result(pnl_delta=50.0)
    status = svc.get_status()
    assert status["stats"]["dailyPnL"] == -50.0
    assert status["stats"]["consecutiveLosses"] == 0


# --- TradingModeService ---


def test_trading_mode_can_switch_invalid_mode() -> None:
    settings = SettingsService()
    svc = TradingModeService(settings)
    r = svc.can_switch_to("invalid")
    assert r["allowed"] is False


def test_trading_mode_switch_invalid_mode() -> None:
    settings = SettingsService()
    svc = TradingModeService(settings)
    with pytest.raises(AppError) as exc:
        svc.switch_mode("invalid")
    assert "BUSINESS_RULE" in exc.value.error_code


# --- AutoPaperService ---


def test_auto_paper_enable_non_paper_mode() -> None:
    settings = SettingsService()
    settings.update("trading_mode", "real")
    mode_svc = TradingModeService(settings)
    ap_svc = AutoPaperService(
        settings, mode_svc, None, trading_request_service=None, risk_service=RiskService(settings)
    )
    with pytest.raises(AppError) as exc:
        ap_svc.enable()
    assert "AUTO_EXECUTION_FORBIDDEN" in exc.value.error_code


def test_auto_paper_status_string_false_not_truthy() -> None:
    settings = SettingsService()
    settings.update("auto_paper_enabled", "false")
    mode_svc = TradingModeService(settings)
    ap_svc = AutoPaperService(
        settings, mode_svc, None, trading_request_service=None, risk_service=RiskService(settings)
    )
    status = ap_svc.get_status()
    assert status["enabled"] is False


@pytest.mark.asyncio
async def test_auto_paper_can_auto_execute_disabled() -> None:
    """can_auto_execute возвращает False если auto-paper выключен."""
    settings = SettingsService()
    settings.update("trading_mode", "paper")
    settings.update("auto_paper_enabled", False)
    mode_svc = TradingModeService(settings)
    risk_svc = RiskService(settings)

    class TradingRepo:
        async def get_by_id(self, *_):
            return SimpleNamespace(status="PENDING", figi="F1", action="BUY", quantity=10, price=Decimal("100"),
                budget=Decimal("1000"), expires_at=None, confidence=Decimal("0.8"), score=Decimal("0.7"))

    class TradingSvc:
        pass

    ap_svc = AutoPaperService(
        settings, mode_svc, TradingRepo(),
        trading_request_service=TradingSvc(), risk_service=risk_svc,
    )
    r = await ap_svc.can_auto_execute(None, uuid4())
    assert r["canAutoExecute"] is False
    assert "disabled" in str(r.get("reason", "")).lower()


@pytest.mark.asyncio
async def test_auto_paper_can_auto_execute_non_paper_mode() -> None:
    """can_auto_execute возвращает False если режим не paper."""
    settings = SettingsService()
    settings.update("trading_mode", "real")
    mode_svc = TradingModeService(settings)
    risk_svc = RiskService(settings)
    ap_svc = AutoPaperService(
        settings, mode_svc, None, trading_request_service=None, risk_service=risk_svc,
    )
    r = await ap_svc.can_auto_execute(None, uuid4())
    assert r["canAutoExecute"] is False
    assert "paper" in str(r.get("reason", "")).lower()


# --- AuthService ---


@pytest.mark.asyncio
async def test_auth_login_db_unavailable_returns_service_unavailable() -> None:
    from app.core.config import Settings
    settings = Settings.model_construct(database_url="x", jwt_secret="secret", jwt_expires_in="7d")
    svc = AuthService(settings)
    with pytest.raises(AppError) as exc:
        await svc.login(None, "admin", "admin123")
    assert exc.value.error_code == "SERVICE_UNAVAILABLE"


@pytest.mark.asyncio
async def test_auth_verify_decode() -> None:
    from app.core.config import Settings
    settings = Settings.model_construct(
        database_url="x", jwt_secret="secret", jwt_expires_in="7d",
        user_password="admin123",
    )
    svc = AuthService(settings)
    token = svc._encode_token(user_id=1, username="admin")
    with pytest.raises(AppError) as exc:
        await svc.verify(None, token)
    assert exc.value.error_code == "SERVICE_UNAVAILABLE"


@pytest.mark.asyncio
async def test_auth_verify_invalid_token() -> None:
    from app.core.config import Settings
    settings = Settings(
        database_url="postgresql+asyncpg://localhost/test",
        jwt_secret="secret", jwt_expires_in="7d",
    )
    svc = AuthService(settings)
    user = await svc.verify(None, "invalid-token")
    assert user is None


# --- TradingRequestService (unit with mocks) ---


@pytest.mark.asyncio
async def test_trading_request_service_get_requests_exception() -> None:
    class FailingRepo:
        async def list_requests(self, *args, **kwargs):
            raise RuntimeError("db error")
    market = type("M", (), {})()
    svc = TradingRequestService(FailingRepo(), market)
    items, total = await svc.get_requests(None)
    assert items == []
    assert total == 0


@pytest.mark.asyncio
async def test_trading_request_service_create_from_recommendation_not_found() -> None:
    class MarketRepo:
        async def get_recommendation_by_figi(self, *_):
            return None
        async def get_instrument_by_figi(self, *_):
            return None
    class TradingRepo:
        async def count_active_by_figi(self, *_):
            return 0
    svc = TradingRequestService(TradingRepo(), MarketRepo())
    with pytest.raises(AppError) as exc:
        await svc.create_from_recommendation(None, "FIGI-X")
    assert "RECOMMENDATION_NOT_FOUND" in exc.value.error_code


@pytest.mark.asyncio
async def test_trading_request_service_create_from_recommendation_duplicate() -> None:
    rec = SimpleNamespace(figi="F1", recommendation="BUY", confidence=Decimal("0.8"), score=Decimal("0.7"))
    inst = SimpleNamespace(ticker="T1", name="N1", last_price=Decimal("100"))
    class MarketRepo:
        async def get_recommendation_by_figi(self, *_):
            return rec
        async def get_instrument_by_figi(self, *_):
            return inst
    class TradingRepo:
        async def count_active_by_figi(self, _session, *, figi):
            return 1
    svc = TradingRequestService(TradingRepo(), MarketRepo())
    with pytest.raises(AppError) as exc:
        await svc.create_from_recommendation(None, "F1")
    assert "CONFLICT" in exc.value.error_code


@pytest.mark.asyncio
async def test_trading_request_service_create_from_data_missing_figi() -> None:
    class MarketRepo:
        async def get_instrument_by_figi(self, *_):
            return None
    class TradingRepo:
        async def count_active_by_figi(self, *_):
            return 0
        async def create(self, *_2, **kwargs):
            return SimpleNamespace(id=uuid4(), status="PENDING", figi=kwargs["figi"], mode=kwargs["mode"],
                action=kwargs["action"], quantity=kwargs["quantity"], price=kwargs["price"],
                budget=kwargs["budget"], created_at="", updated_at="", approved_at=None, executed_at=None,
                expires_at=None, ticker=None, name=None, confidence=None, score=None,
                reject_reason=None, actual_price=None, actual_amount=None)
    svc = TradingRequestService(TradingRepo(), MarketRepo())
    with pytest.raises(AppError) as exc:
        await svc.create_from_data(None, {})
    assert "BAD_REQUEST" in exc.value.error_code


@pytest.mark.asyncio
async def test_trading_request_service_create_from_data_ok() -> None:
    class MarketRepo:
        async def get_instrument_by_figi(self, *_):
            return None
    class TradingRepo:
        async def count_active_by_figi(self, _session, *, figi):
            return 0
        async def create(self, _session, **kwargs):
            return SimpleNamespace(id=uuid4(), status="PENDING", figi=kwargs["figi"], mode=kwargs["mode"],
                action=kwargs["action"], quantity=kwargs["quantity"], price=kwargs["price"],
                budget=kwargs["budget"], created_at="", updated_at="", approved_at=None, executed_at=None,
                expires_at=None, ticker=None, name=None, confidence=None, score=None,
                reject_reason=None, actual_price=None, actual_amount=None)
    svc = TradingRequestService(TradingRepo(), MarketRepo())
    dto = await svc.create_from_data(None, {"figi": "F1", "recommendation": "BUY", "price": 100})
    assert dto["status"] == "PENDING"
    assert dto["action"] == "BUY"
    assert dto["figi"] == "F1"


@pytest.mark.asyncio
async def test_trading_request_service_approve_not_found() -> None:
    class TradingRepo:
        async def get_by_id(self, *_):
            return None
    svc = TradingRequestService(TradingRepo(), None)
    with pytest.raises(AppError) as exc:
        await svc.approve(None, uuid4())
    assert "TRADING_REQUEST_NOT_FOUND" in exc.value.error_code


@pytest.mark.asyncio
async def test_trading_request_service_approve_invalid_transition() -> None:
    req = SimpleNamespace(status="APPROVED")
    class TradingRepo:
        async def get_by_id(self, *_):
            return req
    svc = TradingRequestService(TradingRepo(), None)
    with pytest.raises(AppError) as exc:
        await svc.approve(None, uuid4())
    assert "INVALID_STATE_TRANSITION" in exc.value.error_code


@pytest.mark.asyncio
async def test_trading_request_service_get_stats_exception() -> None:
    class FailingRepo:
        async def list_requests(self, *args, **kwargs):
            raise RuntimeError("db error")
    svc = TradingRequestService(FailingRepo(), None)
    r = await svc.get_stats(None)
    assert r["byStatus"] == {}
    assert r["total"] == 0


@pytest.mark.asyncio
async def test_trading_request_service_reject_not_found() -> None:
    class TradingRepo:
        async def get_by_id(self, *_):
            return None
    svc = TradingRequestService(TradingRepo(), None)
    with pytest.raises(AppError) as exc:
        await svc.reject(None, uuid4(), "reason")
    assert "TRADING_REQUEST_NOT_FOUND" in exc.value.error_code


@pytest.mark.asyncio
async def test_trading_request_service_execute_not_found() -> None:
    class TradingRepo:
        async def get_by_id(self, *_):
            return None
    svc = TradingRequestService(TradingRepo(), None)
    with pytest.raises(AppError) as exc:
        await svc.execute(None, uuid4())
    assert "TRADING_REQUEST_NOT_FOUND" in exc.value.error_code


@pytest.mark.asyncio
async def test_trading_request_service_execute_updates_risk_stats() -> None:
    req = SimpleNamespace(status="APPROVED", budget=Decimal("100"))

    class TradingRepo:
        async def get_by_id(self, *_):
            return req

        async def update_status(self, _session, _request_id, _status, **kwargs):
            return SimpleNamespace(
                id=uuid4(),
                status="EXECUTED",
                figi="F1",
                mode="paper",
                action="BUY",
                quantity=1,
                price=Decimal("100"),
                budget=Decimal("100"),
                created_at="",
                updated_at="",
                approved_at=None,
                executed_at=kwargs.get("executed_at"),
                expires_at=None,
                ticker=None,
                name=None,
                confidence=None,
                score=None,
                reject_reason=None,
                actual_price=kwargs.get("actual_price"),
                actual_amount=kwargs.get("actual_amount"),
            )

    risk = RiskService(SettingsService())
    svc = TradingRequestService(TradingRepo(), None, risk_service=risk)
    await svc.execute(None, uuid4(), actual_amount=Decimal("90"))
    assert risk.get_status()["stats"]["dailyPnL"] == -10.0


@pytest.mark.asyncio
async def test_trading_request_service_cancel_not_found() -> None:
    class TradingRepo:
        async def get_by_id(self, *_):
            return None
    svc = TradingRequestService(TradingRepo(), None)
    with pytest.raises(AppError) as exc:
        await svc.cancel(None, uuid4())
    assert "TRADING_REQUEST_NOT_FOUND" in exc.value.error_code


@pytest.mark.asyncio
async def test_trading_request_service_reject_invalid_transition() -> None:
    req = SimpleNamespace(status="EXECUTED")
    class TradingRepo:
        async def get_by_id(self, *_):
            return req
    svc = TradingRequestService(TradingRepo(), None)
    with pytest.raises(AppError) as exc:
        await svc.reject(None, uuid4(), "reason")
    assert "INVALID_STATE_TRANSITION" in exc.value.error_code


# --- RecommendationPipelineService ---


@pytest.mark.asyncio
async def test_recommendation_pipeline_fetch_error() -> None:
    class FailingMarket:
        async def list_recommendations(self, *args, **kwargs):
            raise RuntimeError("db error")
    svc = RecommendationPipelineService(None, FailingMarket(), None)
    r = await svc.run(None)
    assert "error" in r
    assert r["created"] == []


@pytest.mark.asyncio
async def test_recommendation_pipeline_skip_threshold() -> None:
    rec = SimpleNamespace(figi="F1", recommendation="BUY", confidence=Decimal("0.3"), score=Decimal("0.2"))
    class MarketRepo:
        async def list_recommendations(self, *args, **kwargs):
            return [rec]
    class TradingRepo:
        async def count_active_by_figi(self, *_):
            return 0
    class TradingSvc:
        async def create_from_recommendation(self, *args, **kwargs):
            return {}
    svc = RecommendationPipelineService(TradingSvc(), MarketRepo(), TradingRepo())
    r = await svc.run(None, min_confidence=Decimal("0.5"), min_score=Decimal("0.5"))
    assert len(r["skipped"]) == 1
    assert r["skipped"][0]["reason"] == "threshold"


@pytest.mark.asyncio
async def test_recommendation_pipeline_skip_hold() -> None:
    rec = SimpleNamespace(figi="F1", recommendation="HOLD", confidence=Decimal("0.8"), score=Decimal("0.7"))
    class MarketRepo:
        async def list_recommendations(self, *args, **kwargs):
            return [rec]
    class TradingRepo:
        async def count_active_by_figi(self, *_):
            return 0
    svc = RecommendationPipelineService(None, MarketRepo(), TradingRepo())
    r = await svc.run(None)
    assert len(r["skipped"]) == 1
    assert r["skipped"][0]["reason"] == "hold"


@pytest.mark.asyncio
async def test_recommendation_pipeline_create_success() -> None:
    rec = SimpleNamespace(figi="F1", recommendation="BUY", confidence=Decimal("0.8"), score=Decimal("0.7"))
    class MarketRepo:
        async def list_recommendations(self, *args, **kwargs):
            return [rec]
    created_dto = {"id": uuid4(), "status": "PENDING"}
    class TradingSvc:
        async def create_from_recommendation(self, _s, figi, **kwargs):
            return {**created_dto, "figi": figi}
    class TradingRepo:
        async def count_active_by_figi(self, _session, *, figi):
            return 0
    svc = RecommendationPipelineService(TradingSvc(), MarketRepo(), TradingRepo())
    r = await svc.run(None)
    assert len(r["created"]) == 1
    assert r["created"][0] == "F1"


@pytest.mark.asyncio
async def test_recommendation_pipeline_skip_duplicate() -> None:
    rec = SimpleNamespace(figi="F1", recommendation="BUY", confidence=Decimal("0.8"), score=Decimal("0.7"))
    class MarketRepo:
        async def list_recommendations(self, *args, **kwargs):
            return [rec]
    class TradingRepo:
        async def count_active_by_figi(self, _session, *, figi):
            return 1
    svc = RecommendationPipelineService(None, MarketRepo(), TradingRepo())
    r = await svc.run(None)
    assert len(r["skipped"]) == 1
    assert r["skipped"][0]["reason"] == "duplicate"


# --- API routes ---


@pytest.mark.asyncio
async def test_api_trading_requests_create_missing_params(client: AsyncClient) -> None:
    r = await client.post("/api/v1/trading-requests/create", json={})
    assert r.status_code in (400, 422)


@pytest.mark.asyncio
async def test_api_trading_requests_list_with_filters(client: AsyncClient) -> None:
    """Список заявок с фильтрами status и mode."""
    r = await client.get("/api/v1/trading-requests", params={"status": "PENDING", "mode": "paper"})
    assert r.status_code == 200
    assert "items" in r.json()["data"]
    assert "meta" in r.json()["data"]


@pytest.mark.asyncio
async def test_api_trading_requests_pending_approved(client: AsyncClient) -> None:
    """Проверка эндпоинтов pending и approved."""
    r1 = await client.get("/api/v1/trading-requests/pending")
    r2 = await client.get("/api/v1/trading-requests/approved")
    assert r1.status_code == 200 and "items" in r1.json()["data"]
    assert r2.status_code == 200 and "items" in r2.json()["data"]


def _create_request_body(figi: str) -> dict:
    """Тело для create с recommendationData."""
    return {
        "recommendationData": {
            "figi": figi,
            "recommendation": "BUY",
            "price": 100,
        },
        "options": {"action": "BUY", "mode": "paper", "quantity": 1},
    }


@pytest.mark.asyncio
async def test_api_trading_requests_create_from_data(
    client: AsyncClient, db_available: bool
) -> None:
    """Создание заявки через recommendationData."""
    if not db_available:
        pytest.skip("DB tables not available")
    figi = f"TEST-{uuid4().hex[:12]}"
    r = await client.post("/api/v1/trading-requests/create", json=_create_request_body(figi))
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["status"] == "PENDING"
    assert data["figi"] == figi
    assert data["action"] == "BUY"


@pytest.mark.asyncio
async def test_api_trading_requests_create_approve_execute_flow(
    client: AsyncClient, db_available: bool
) -> None:
    """Полный lifecycle: create -> approve -> execute."""
    if not db_available:
        pytest.skip("DB tables not available")
    figi = f"TEST-{uuid4().hex[:12]}"
    create_r = await client.post("/api/v1/trading-requests/create", json=_create_request_body(figi))
    assert create_r.status_code == 200
    req_id = create_r.json()["data"]["id"]

    approve_r = await client.post(f"/api/v1/trading-requests/{req_id}/approve", json={})
    assert approve_r.status_code == 200
    assert approve_r.json()["data"]["status"] == "APPROVED"

    exec_r = await client.post(
        f"/api/v1/trading-requests/{req_id}/execute",
        json={"actualPrice": 101, "actualAmount": 101},
    )
    assert exec_r.status_code == 200
    assert exec_r.json()["data"]["status"] == "EXECUTED"


@pytest.mark.asyncio
async def test_api_trading_requests_reject_flow(
    client: AsyncClient, db_available: bool
) -> None:
    """Create -> reject."""
    if not db_available:
        pytest.skip("DB tables not available")
    figi = f"TEST-{uuid4().hex[:12]}"
    create_r = await client.post("/api/v1/trading-requests/create", json=_create_request_body(figi))
    assert create_r.status_code == 200
    req_id = create_r.json()["data"]["id"]

    reject_r = await client.post(
        f"/api/v1/trading-requests/{req_id}/reject",
        json={"reason": "Тестовое отклонение"},
    )
    assert reject_r.status_code == 200
    assert reject_r.json()["data"]["status"] == "REJECTED"


@pytest.mark.asyncio
async def test_api_trading_requests_cancel_flow(
    client: AsyncClient, db_available: bool
) -> None:
    """Create -> cancel."""
    if not db_available:
        pytest.skip("DB tables not available")
    figi = f"TEST-{uuid4().hex[:12]}"
    create_r = await client.post("/api/v1/trading-requests/create", json=_create_request_body(figi))
    assert create_r.status_code == 200
    req_id = create_r.json()["data"]["id"]

    cancel_r = await client.post(f"/api/v1/trading-requests/{req_id}/cancel")
    assert cancel_r.status_code == 200
    assert cancel_r.json()["data"]["status"] == "CANCELLED"


@pytest.mark.asyncio
async def test_api_trading_requests_stats_with_mode(client: AsyncClient) -> None:
    """GET /stats с фильтром mode."""
    r = await client.get("/api/v1/trading-requests/stats", params={"mode": "paper"})
    assert r.status_code == 200
    data = r.json()["data"]
    assert "byStatus" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_api_auto_paper_can_execute_and_execute(
    client: AsyncClient, db_available: bool
) -> None:
    """Интеграционные тесты GET can-execute/{id} и POST execute/{id}."""
    if not db_available:
        pytest.skip("DB tables not available")
    await client.post("/api/v1/trading-mode/switch", json={"mode": "paper"})
    await client.post("/api/v1/auto-paper-trading/enable")
    await client.post(
        "/api/v1/risk/limits",
        json={"minConfidence": 0.3, "minScore": 0.3},
    )
    try:
        figi = f"TEST-AP-{uuid4().hex[:12]}"
        create_r = await client.post(
            "/api/v1/trading-requests/create", json=_create_request_body(figi)
        )
        assert create_r.status_code == 200
        req_id = create_r.json()["data"]["id"]

        can_r = await client.get(
            f"/api/v1/auto-paper-trading/can-execute/{req_id}"
        )
        assert can_r.status_code == 200
        can_data = can_r.json()["data"]
        assert "canAutoExecute" in can_data
        if can_data.get("canAutoExecute"):
            exec_r = await client.post(
                f"/api/v1/auto-paper-trading/execute/{req_id}"
            )
            assert exec_r.status_code == 200
            assert exec_r.json()["data"]["status"] == "EXECUTED"
    finally:
        await client.post("/api/v1/auto-paper-trading/disable")


# --- Additional API tests (market, news, performance, profitability) ---


@pytest.mark.asyncio
async def test_api_market_recommendations(client: AsyncClient) -> None:
    """GET market/recommendations."""
    r = await client.get("/api/v1/market/recommendations", params={"offset": 0, "limit": 10})
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data
    assert "meta" in data
    assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_api_market_stock_candles(client: AsyncClient) -> None:
    """GET market/stock/{figi}/candles — при отсутствии свечей возвращает 404."""
    instruments_r = await client.get("/api/v1/market/instruments", params={"limit": 1})
    assert instruments_r.status_code == 200
    items = instruments_r.json()["data"]["items"]
    if items:
        figi = items[0]["figi"]
        candles_r = await client.get(
            f"/api/v1/market/stock/{figi}/candles", params={"limit": 10}
        )
        assert candles_r.status_code in (200, 404)
        if candles_r.status_code == 200:
            assert "items" in candles_r.json()["data"]
    else:
        r = await client.get(
            "/api/v1/market/stock/NONEXISTENT/candles", params={"limit": 10}
        )
        assert r.status_code == 404


@pytest.mark.asyncio
async def test_api_news_by_figi_pagination(client: AsyncClient) -> None:
    """GET news/{figi} с offset, limit."""
    r = await client.get(
        "/api/v1/news/BBG004730N88",
        params={"offset": 0, "limit": 5, "days": 30},
    )
    assert r.status_code == 200
    data = r.json()["data"]
    assert "items" in data
    assert "meta" in data
    assert len(data["items"]) <= 5


@pytest.mark.asyncio
async def test_api_performance_sectors_benchmarks(client: AsyncClient) -> None:
    """sector-analysis и benchmark/list."""
    sector_r = await client.get(
        "/api/v1/performance/sector-analysis", params={"days": 30}
    )
    assert sector_r.status_code == 200
    assert sector_r.json()["success"] is True

    bench_r = await client.get("/api/v1/performance/benchmark/list")
    assert bench_r.status_code == 200
    data = bench_r.json()["data"]
    assert "items" in data
    assert "meta" in data


@pytest.mark.asyncio
async def test_api_profitability_status_analysis(client: AsyncClient) -> None:
    """status и analysis."""
    status_r = await client.get("/api/v1/profitability/status")
    assert status_r.status_code == 200
    assert status_r.json()["success"] is True

    analysis_r = await client.get("/api/v1/profitability/analysis")
    assert analysis_r.status_code == 200
    data = analysis_r.json()["data"]
    assert "profitFactor" in data
    assert "winRate" in data


@pytest.mark.asyncio
async def test_api_risk_limits_update(client: AsyncClient) -> None:
    r = await client.post("/api/v1/risk/limits", json={"maxPositionSize": 0.03})
    assert r.status_code == 200
    assert r.json()["data"]["maxPositionSize"] == 0.03


@pytest.mark.asyncio
async def test_api_risk_validate_invalid(client: AsyncClient) -> None:
    r = await client.post(
        "/api/v1/risk/validate",
        json={
            "figi": "F1",
            "action": "HOLD",
            "quantity": 10,
            "price": 100,
            "confidence": 0.8,
            "score": 0.7,
        },
    )
    assert r.status_code == 200
    assert r.json()["data"]["isValid"] is False


# --- ProfitabilityService exception paths ---


@pytest.mark.asyncio
async def test_profitability_service_get_status_exception() -> None:
    class FailingRepo:
        async def status_summary(self, *_):
            raise RuntimeError("db error")
    from app.services.profitability_service import ProfitabilityService
    svc = ProfitabilityService(FailingRepo())
    r = await svc.get_status(None)
    assert r["isInitialized"] is False
    assert r["trackedStrategies"] == 0


@pytest.mark.asyncio
async def test_profitability_service_get_analysis_exception() -> None:
    class FailingRepo:
        async def pnl_aggregate(self, *_):
            raise RuntimeError("db error")
    from app.services.profitability_service import ProfitabilityService
    svc = ProfitabilityService(FailingRepo())
    r = await svc.get_analysis(None)
    assert r["profitFactor"] == 0.0
    assert r["winRate"] == 0.0


# --- PerformanceService exception paths ---


@pytest.mark.asyncio
async def test_performance_service_get_sector_analysis_exception() -> None:
    class FailingRepo:
        async def list_sector_counts(self, *_):
            raise RuntimeError("db error")
    from app.services.performance_service import PerformanceService
    svc = PerformanceService(FailingRepo())
    items, total = await svc.get_sector_analysis(None, days=30)
    assert items == []
    assert total == 0


@pytest.mark.asyncio
async def test_performance_service_get_dashboard_exception() -> None:
    class FailingRepo:
        async def trading_request_count(self, *_):
            raise RuntimeError("db error")
    from app.services.performance_service import PerformanceService
    svc = PerformanceService(FailingRepo())
    r = await svc.get_dashboard(None, period=30, strategy=None, sector=None)
    assert r["summary"]["requestCount"] == 0


@pytest.mark.asyncio
async def test_performance_service_get_benchmark_list_exception() -> None:
    class FailingRepo:
        async def list_benchmarks(self, *_):
            raise RuntimeError("db error")
    from app.services.performance_service import PerformanceService
    svc = PerformanceService(FailingRepo())
    items, total = await svc.get_benchmark_list(None)
    assert items == []
    assert total == 0


@pytest.mark.asyncio
async def test_performance_service_get_sectors_exception() -> None:
    class FailingRepo:
        async def list_sectors(self, *_):
            raise RuntimeError("db error")
    from app.services.performance_service import PerformanceService
    svc = PerformanceService(FailingRepo())
    items, total = await svc.get_sectors(None)
    assert items == []
    assert total == 0


# --- MarketService get_stock None ---


@pytest.mark.asyncio
async def test_market_service_get_stock_none() -> None:
    class Repo:
        async def get_instrument_by_figi(self, *_):
            return None
    from app.services.market_service import MarketService
    svc = MarketService(Repo())
    r = await svc.get_stock(None, "NOT-FOUND")
    assert r is None
