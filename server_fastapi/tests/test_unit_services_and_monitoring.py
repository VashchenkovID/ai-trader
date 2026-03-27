from types import SimpleNamespace

import pytest
from httpx import AsyncClient

from app.db import base as db_base
from app.main import app
from app.services.market_service import MarketService
from app.services.news_service import NewsService
from app.services.performance_service import PerformanceService
from app.services.profitability_service import ProfitabilityService
from app.services.settings_service import SettingsService


@pytest.mark.asyncio
async def test_monitoring_endpoints_extended(client: AsyncClient) -> None:
    class FakeRegistry:
        def __init__(self) -> None:
            self.reset_called = False

        def snapshot(self) -> dict[str, dict[str, float | int]]:
            return {
                "/api/v1/auth/login": {"count": 100, "errorCount": 6, "errorRate": 0.06, "p95LatencyMs": 1200},
                "/api/v1/health": {"count": 20, "errorCount": 0, "errorRate": 0.0, "p95LatencyMs": 10},
            }

        def reset(self) -> None:
            self.reset_called = True

    prev_registry = app.state.metrics_registry
    fake_registry = FakeRegistry()
    app.state.metrics_registry = fake_registry
    try:
        alerts = await client.get("/api/v1/monitoring/alerts", params={"severity": "critical", "limit": 1})
        assert alerts.status_code == 200
        body = alerts.json()
        assert body["success"] is True
        assert body["data"]["count"] == 1
        assert body["data"]["items"][0]["severity"] == "critical"

        resolve = await client.post("/api/v1/monitoring/alerts/test-alert/resolve")
        assert resolve.status_code == 200
        assert resolve.json()["data"]["resolved"] is True

        perf = await client.get("/api/v1/monitoring/performance")
        assert perf.status_code == 200
        assert perf.json()["data"]["throughput"] == 120

        health = await client.get("/api/v1/monitoring/health")
        assert health.status_code == 200
        assert health.json()["data"]["status"] == "healthy"

        report = await client.get("/api/v1/monitoring/report")
        assert report.status_code == 200
        assert "recentAlerts" in report.json()["data"]

        reset = await client.post("/api/v1/monitoring/reset")
        assert reset.status_code == 200
        assert fake_registry.reset_called is True
    finally:
        app.state.metrics_registry = prev_registry


@pytest.mark.asyncio
async def test_market_service_paths() -> None:
    class Repo:
        async def list_instruments(self, _session, *, offset=0, limit=200):
            return [SimpleNamespace(figi="F1", ticker="T1", name="N1", sector="tech", currency="RUB", last_price=10)]
        async def count_instruments(self, _session):
            return 1

        async def list_recommendations_with_instrument(self, _session, *, offset=0, limit=200):
            return [
                (
                    SimpleNamespace(
                        id="rec-1",
                        figi="F1",
                        recommendation="BUY",
                        confidence=0.9,
                        score=0.8,
                        analysis_date="2026-01-01",
                        llm_jury_payload={"reason": "test"},
                        nn_score=0.8,
                        nn_confidence=0.9,
                        nn_payload={
                            "featureColumns": ["ret1", "ret5", "ret20", "vol_norm"],
                            "featureValues": [0.01, -0.02, 0.03, 0.5],
                        },
                    ),
                    "T1",
                    "N1",
                    10,
                )
            ]
        async def count_recommendations(self, _session):
            return 1

        async def get_instrument_by_figi(self, _session, _figi):
            return SimpleNamespace(figi="F1", ticker="T1", name="N1", sector="tech", currency="RUB", last_price=10, lot=1)

        async def get_candles_by_figi(self, _session, *, figi, offset=0, limit=30):
            return [
                SimpleNamespace(candle_time="2026-01-01", open=1, high=2, low=1, close=1, volume=0),
                SimpleNamespace(candle_time="2026-01-02", open=2, high=3, low=1, close=2, volume=0),
            ]
        async def count_candles_by_figi(self, _session, *, figi):
            return 2

    service = MarketService(repository=Repo())
    instruments, total_instruments = await service.get_instruments(None)
    assert instruments[0]["figi"] == "F1"
    assert total_instruments == 1

    recommendations, total_recs = await service.get_recommendations(None)
    assert recommendations[0]["recommendation"] == "BUY"
    assert recommendations[0]["ticker"] == "T1"
    assert recommendations[0]["horizonMomentum"][0]["id"] == "1d"
    assert recommendations[0]["horizonMomentum"][0]["returnPct"] == 1.0
    assert total_recs == 1

    stock = await service.get_stock(None, "F1")
    assert stock is not None
    assert stock["lot"] == 1

    candles, total_candles = await service.get_candles(None, figi="F1", limit=2)
    assert candles[0]["time"] == "2026-01-01"
    assert total_candles == 2


@pytest.mark.asyncio
async def test_news_service_paths() -> None:
    class Repo:
        async def count_and_last_update(self, _session):
            return 5, "2026-01-01"

        async def list_instruments(self, _session, *, offset=0, limit=200):
            return [SimpleNamespace(figi="F1", ticker="T1", name="N1")]
        async def count_instruments(self, _session):
            return 1

        async def list_news_by_figi(self, _session, *, figi, offset=0, limit=20, days=30):
            return [SimpleNamespace(id="1", figi=figi, title="t", summary="s", sentiment="neutral", published_at="x")]
        async def count_news_by_figi(self, _session, *, figi, days):
            return 1

    service = NewsService(repository=Repo())
    status = await service.get_status(None)
    assert status["initialized"] is True
    assert status["records"] == 5

    instruments, total_instruments = await service.get_instruments(None)
    assert instruments[0]["figi"] == "F1"
    assert total_instruments == 1

    news, total_news = await service.get_news(None, figi="F1", limit=5, days=7)
    assert len(news) == 1
    assert total_news == 1


@pytest.mark.asyncio
async def test_performance_service_paths() -> None:
    class Repo:
        async def list_sector_counts(self, _session, *, offset=0, limit=200):
            return [("tech", 2)]
        async def count_sector_groups(self, _session):
            return 1

        async def trading_request_count(self, _session):
            return 7

        async def list_benchmarks(self, _session, *, offset=0, limit=50):
            return ["imoex"]
        async def count_benchmarks(self, _session):
            return 1

        async def list_sectors(self, _session, *, offset=0, limit=200):
            return ["energy", "tech"]
        async def count_sectors(self, _session):
            return 2

    service = PerformanceService(repository=Repo())
    sectors, total_sectors = await service.get_sector_analysis(None, days=30)
    assert sectors[0]["days"] == 30
    assert total_sectors == 1

    dashboard = await service.get_dashboard(None, period=30, strategy=None, sector=None)
    assert dashboard["summary"]["requestCount"] == 7

    benchmarks, total_benchmarks = await service.get_benchmark_list(None)
    assert benchmarks[0]["name"] == "IMOEX"
    assert total_benchmarks == 1

    known_sectors, sectors_total = await service.get_sectors(None)
    assert known_sectors == ["energy", "tech"]
    assert sectors_total == 2


@pytest.mark.asyncio
async def test_profitability_service_paths() -> None:
    class Repo:
        async def status_summary(self, _session):
            return 10, "2026-01-01"

        async def pnl_aggregate(self, _session):
            return 200.0, 100.0, 4, 3

    service = ProfitabilityService(repository=Repo())
    status = await service.get_status(None)
    assert status["trackedStrategies"] == 10

    analysis = await service.get_analysis(None)
    assert analysis["profitFactor"] == 2.0
    assert analysis["winRate"] == 0.75

    report = await service.get_report(None)
    assert report["pnl"] == 100.0


def test_settings_service_and_db_base_import() -> None:
    service = SettingsService()
    all_items, total_items = service.get_all()
    assert all_items
    assert total_items >= 2

    updated = service.update("system.mode", "real")
    assert updated.value == "real"

    created = service.update("new.key", 123)
    assert created.key == "new.key"
    assert created.value == 123

    kelly = service.get_kelly()
    assert kelly is not None
    updated_kelly = service.update_kelly({"minTrades": 50})
    assert updated_kelly.minTrades == 50

    # Покрываем импорт-агрегатор app.db.base
    assert hasattr(db_base, "Base")
    assert hasattr(db_base, "TradingRequest")
    assert hasattr(db_base, "User")
    assert hasattr(db_base, "Instrument")
    assert hasattr(db_base, "AppSetting")


@pytest.mark.asyncio
async def test_additional_api_routes_for_coverage(client: AsyncClient) -> None:
    metrics = await client.get("/api/v1/metrics")
    assert metrics.status_code == 200
    assert "routes" in metrics.json()["data"]

    system_health = await client.get("/api/v1/system/health")
    assert system_health.status_code == 200
    assert system_health.json()["data"]["status"] == "healthy"

    system_settings = await client.get("/api/v1/system/settings")
    assert system_settings.status_code == 200
    assert isinstance(system_settings.json()["data"]["items"], list)

    system_errors = await client.get("/api/v1/system/errors/registry")
    assert system_errors.status_code == 200
    assert "items" in system_errors.json()["data"]

    perf_alias = await client.get("/api/v1/system/performance/metrics")
    assert perf_alias.status_code == 200
    assert "throughput" in perf_alias.json()["data"]

    analysis_kpi = await client.get("/api/v1/system/analysis/kpi", params={"window": "7d"})
    assert analysis_kpi.status_code == 200
    kpi_data = analysis_kpi.json()["data"]
    assert "definitions" in kpi_data
    assert "thresholds" in kpi_data
    assert "report" in kpi_data
    assert "alerts" in kpi_data
    assert "business" in kpi_data["report"]

    settings_update = await client.put("/api/v1/settings", json={"key": "a.b", "value": 1})
    assert settings_update.status_code == 200
    assert settings_update.json()["data"]["key"] == "a.b"

    kelly_get = await client.get("/api/v1/settings/kelly")
    assert kelly_get.status_code == 200

    kelly_ok = await client.put(
        "/api/v1/settings/kelly",
        json={"conservativeFactor": 0.4, "minTrades": 10, "volatilityPeriod": 30},
    )
    assert kelly_ok.status_code == 200
    assert kelly_ok.json()["success"] is True

    kelly_min_trades_error = await client.put("/api/v1/settings/kelly", json={"minTrades": 0})
    assert kelly_min_trades_error.status_code == 400

    kelly_volatility_error = await client.put("/api/v1/settings/kelly", json={"volatilityPeriod": 5})
    assert kelly_volatility_error.status_code == 400

    market_recs = await client.get("/api/v1/market/recommendations")
    assert market_recs.status_code == 200
    assert market_recs.json()["success"] is True
    assert "meta" in market_recs.json()["data"]

    market_stock_not_found = await client.get("/api/v1/market/stock/NOT-FOUND")
    assert market_stock_not_found.status_code == 404

    market_candles_not_found = await client.get("/api/v1/market/stock/NOT-FOUND/candles")
    assert market_candles_not_found.status_code == 404

    news_instruments = await client.get("/api/v1/news/instruments")
    assert news_instruments.status_code == 200
    assert news_instruments.json()["success"] is True

    perf_bench = await client.get("/api/v1/performance/benchmark/list")
    assert perf_bench.status_code == 200
    assert perf_bench.json()["success"] is True

    perf_sectors = await client.get("/api/v1/performance/sectors")
    assert perf_sectors.status_code == 200
    assert perf_sectors.json()["success"] is True

    # Trading requests
    tr_list = await client.get("/api/v1/trading-requests")
    assert tr_list.status_code == 200
    assert "items" in tr_list.json()["data"]
    assert "meta" in tr_list.json()["data"]

    tr_create_bad = await client.post("/api/v1/trading-requests/create", json={})
    assert tr_create_bad.status_code in (400, 422)

    tr_stats = await client.get("/api/v1/trading-requests/stats")
    assert tr_stats.status_code == 200
    assert "byStatus" in tr_stats.json()["data"]

    # Trading mode
    mode_current = await client.get("/api/v1/trading-mode/current")
    assert mode_current.status_code == 200
    assert "mode" in mode_current.json()["data"]

    mode_switch = await client.post("/api/v1/trading-mode/switch", json={"mode": "paper"})
    assert mode_switch.status_code == 200
    assert mode_switch.json()["data"]["mode"] == "paper"

    mode_can = await client.get("/api/v1/trading-mode/can-switch/real")
    assert mode_can.status_code == 200
    assert "allowed" in mode_can.json()["data"]

    # Auto-paper
    ap_status = await client.get("/api/v1/auto-paper-trading/status")
    assert ap_status.status_code == 200
    assert "enabled" in ap_status.json()["data"]

    ap_enable = await client.post("/api/v1/auto-paper-trading/enable")
    assert ap_enable.status_code == 200

    ap_disable = await client.post("/api/v1/auto-paper-trading/disable")
    assert ap_disable.status_code == 200

    ap_stats = await client.get("/api/v1/auto-paper-trading/stats")
    assert ap_stats.status_code == 200
    assert "executedCount" in ap_stats.json()["data"]

    # Recommendation pipeline
    pipeline_run = await client.post("/api/v1/recommendation-pipeline/run")
    assert pipeline_run.status_code == 200
    assert "created" in pipeline_run.json()["data"]
    assert "skipped" in pipeline_run.json()["data"]

    # Preflight-check
    preflight_run = await client.post("/api/v1/preflight-check/run")
    assert preflight_run.status_code == 200
    preflight_body = preflight_run.json()
    assert "passed" in preflight_body["data"]
    assert "results" in preflight_body["data"] or "checks" in preflight_body["data"]

    preflight_status = await client.get("/api/v1/preflight-check/status")
    assert preflight_status.status_code == 200
    assert preflight_status.json()["success"] is True

    preflight_results = await client.get("/api/v1/preflight-check/results")
    assert preflight_results.status_code == 200
    assert preflight_results.json()["success"] is True

    # Risk
    risk_status_resp = await client.get("/api/v1/risk/status")
    assert risk_status_resp.status_code == 200
    assert "limits" in risk_status_resp.json()["data"]

    risk_limits = await client.get("/api/v1/risk/limits")
    assert risk_limits.status_code == 200
    assert risk_limits.json()["success"] is True
    assert "maxPositionSize" in risk_limits.json()["data"] or isinstance(
        risk_limits.json()["data"], dict
    )

    risk_validate = await client.post(
        "/api/v1/risk/validate",
        json={
            "figi": "BBG004730N88",
            "action": "BUY",
            "quantity": 10,
            "price": 300,
            "confidence": 0.8,
            "score": 0.75,
        },
    )
    assert risk_validate.status_code == 200
    assert "isValid" in risk_validate.json()["data"]


@pytest.mark.asyncio
async def test_metrics_use_route_templates_for_dynamic_paths(client: AsyncClient) -> None:
    await client.get("/api/v1/system/tasks/task-one")
    await client.get("/api/v1/system/tasks/task-two")
    metrics = await client.get("/api/v1/metrics")
    assert metrics.status_code == 200
    routes = metrics.json()["data"]["routes"]
    dynamic = [k for k in routes.keys() if k.startswith("GET /api/v1/system/tasks/")]
    assert "GET /api/v1/system/tasks/{task_id}" in dynamic


@pytest.mark.asyncio
async def test_system_status_reads_running_state(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api.v1 import system as system_api

    async def _fake_snapshot():
        return {
            "system": {},
            "workers": {},
            "tasks": [],
            "scheduler": {
                "training_full": {"status": "running"},
                "analysis_market_portfolio": {"status": "running"},
            },
        }

    monkeypatch.setattr(system_api, "get_status_snapshot", _fake_snapshot)
    resp = await client.get("/api/v1/system/status")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["neuralNetwork"]["status"] == "running"
    assert data["trading"]["status"] == "running"
