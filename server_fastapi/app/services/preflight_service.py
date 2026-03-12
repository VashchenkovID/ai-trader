"""Сервис предварительной проверки готовности к торговле."""

from typing import Any

from app.core.time_utils import iso_now_msk
from app.services.auto_paper_service import AutoPaperService
from app.services.risk_service import RiskService
from app.services.trading_mode_service import TradingModeService


class PreflightService:
    """Проверка готовности системы перед торговлей."""

    def __init__(
        self,
        risk_service: RiskService,
        trading_mode_service: TradingModeService,
        auto_paper_service: AutoPaperService,
    ) -> None:
        self._risk = risk_service
        self._mode = trading_mode_service
        self._auto_paper = auto_paper_service
        self._last_results: dict[str, Any] | None = None

    def run_checks(self) -> dict[str, Any]:
        """Выполняет проверки и возвращает результаты."""
        checks: dict[str, Any] = {}
        errors: list[str] = []
        warnings: list[str] = []

        risk_status = self._risk.get_status()
        checks["risk"] = {
            "status": "ok" if not risk_status.get("emergencyStop") else "fail",
            "limits": risk_status.get("limits", {}),
        }
        if risk_status.get("emergencyStop"):
            errors.append("Экстренная остановка активна")

        mode = self._mode.get_current_mode()
        checks["tradingMode"] = {"status": "ok", "mode": mode}

        ap_status = self._auto_paper.get_status()
        checks["autoPaper"] = {
            "status": "ok",
            "enabled": ap_status.get("enabled", False),
            "phase": ap_status.get("currentPhase", "phase1"),
        }
        if ap_status.get("enabled") and mode != "paper":
            errors.append("Auto-paper включен, но режим не paper")
            checks["autoPaper"]["status"] = "fail"

        overall = "passed" if not errors else "failed"
        self._last_results = {
            "timestamp": iso_now_msk(),
            "overallStatus": overall,
            "checks": checks,
            "errors": errors,
            "warnings": warnings,
        }
        return self._last_results

    def get_status(self) -> dict[str, Any]:
        """Статус последней проверки."""
        if self._last_results is None:
            self.run_checks()
        return {
            "lastCheck": self._last_results.get("timestamp"),
            "overallStatus": self._last_results.get("overallStatus", "unknown"),
        }

    def get_results(self) -> dict[str, Any]:
        """Полные результаты последней проверки."""
        if self._last_results is None:
            self.run_checks()
        return self._last_results
