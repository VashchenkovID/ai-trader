"""Сервис управления рисками: лимиты и валидация ордеров."""

from decimal import Decimal
from typing import Any

from app.services.settings_service import SettingsService


_DEFAULT_LIMITS = {
    "maxPositionSize": 0.05,
    "maxTotalExposure": 0.40,
    "maxDailyLoss": 0.10,
    "maxConsecutiveLosses": 10,
    "minConfidence": 0.6,
}


class RiskService:
    """Проверка лимитов и валидация ордеров."""

    def __init__(self, settings_service: SettingsService) -> None:
        self._settings = settings_service
        self._limits = dict(_DEFAULT_LIMITS)
        self._stats = {
            "consecutiveLosses": 0,
            "dailyPnL": 0.0,
        }

    def _get_limits(self) -> dict[str, float]:
        item = self._settings._settings.get("risk.limits")
        if item and isinstance(item.value, dict):
            return {**self._limits, **item.value}
        return dict(self._limits)

    def get_status(self) -> dict[str, Any]:
        """Возвращает статус риск-менеджмента."""
        limits = self._get_limits()
        return {
            "limits": limits,
            "stats": dict(self._stats),
            "emergencyStop": False,
        }

    def get_limits(self) -> dict[str, float]:
        return self._get_limits()

    def update_limits(self, limits: dict[str, float]) -> dict[str, float]:
        """Обновляет лимиты (сохраняет в настройки)."""
        self._limits.update(limits)
        self._settings.update("risk.limits", dict(self._limits))
        return self._get_limits()

    def record_execution_result(self, *, pnl_delta: float) -> dict[str, Any]:
        """
        Обновляет статистику риска по результату исполненной сделки.
        pnl_delta > 0: прибыль, pnl_delta < 0: убыток.
        """
        self._stats["dailyPnL"] = float(self._stats.get("dailyPnL", 0.0)) + float(pnl_delta)
        if pnl_delta < 0:
            self._stats["consecutiveLosses"] = int(self._stats.get("consecutiveLosses", 0)) + 1
        elif pnl_delta > 0:
            self._stats["consecutiveLosses"] = 0
        return self.get_status()

    def validate_order(
        self,
        *,
        figi: str,
        action: str,
        quantity: int,
        price: Decimal,
        confidence: float,
        score: float,
        portfolio_value: Decimal = Decimal("1000000"),
        current_exposure: Decimal = Decimal("0"),
        confidence_hard_floor: float = 0.4,
        max_position_fraction: float | None = None,
        max_total_exposure_fraction: float | None = None,
        max_position_fraction_cap: float | None = None,
    ) -> dict[str, Any]:
        """
        Валидирует ордер по лимитам.
        Возвращает { isValid, warnings, errors, adjustedQuantity }.
        """
        limits = self._get_limits()
        validation: dict[str, Any] = {
            "isValid": True,
            "warnings": [],
            "errors": [],
            "adjustedQuantity": quantity,
        }

        if action not in ("BUY", "SELL"):
            validation["isValid"] = False
            validation["errors"].append("action must be BUY or SELL")
            return validation

        if confidence < confidence_hard_floor:
            validation["isValid"] = False
            validation["errors"].append(
                f"Уверенность {confidence * 100:.1f}% ниже минимума {confidence_hard_floor * 100:.0f}%"
            )
        elif confidence < limits.get("minConfidence", 0.6):
            validation["warnings"].append(
                f"Уверенность {confidence * 100:.1f}% ниже рекомендуемой"
            )

        if quantity < 1:
            validation["isValid"] = False
            validation["errors"].append("quantity must be >= 1")
            return validation

        if price <= 0:
            validation["isValid"] = False
            validation["errors"].append("price must be > 0")
            return validation

        requested_value = Decimal(quantity) * price
        pos_frac = (
            float(max_position_fraction)
            if max_position_fraction is not None
            else float(limits.get("maxPositionSize", 0.05))
        )
        pos_frac = min(max(pos_frac, 1e-12), 1.0)
        if max_position_fraction_cap is not None:
            cap = float(max_position_fraction_cap)
            if cap > 0:
                pos_frac = min(pos_frac, cap)
        max_position = Decimal(str(pos_frac)) * portfolio_value
        if requested_value > max_position:
            validation["isValid"] = False
            validation["errors"].append(
                f"Размер позиции {float(requested_value):.0f} превышает лимит {float(max_position):.0f}"
            )

        total_after = current_exposure + (requested_value if action == "BUY" else -requested_value)
        exp_frac = (
            float(max_total_exposure_fraction)
            if max_total_exposure_fraction is not None
            else float(limits.get("maxTotalExposure", 0.4))
        )
        exp_frac = min(max(exp_frac, 1e-12), 1.0)
        max_exposure = Decimal(str(exp_frac)) * portfolio_value
        if action == "BUY" and total_after > max_exposure:
            validation["isValid"] = False
            validation["errors"].append(
                f"Общая экспозиция {float(total_after):.0f} превышает лимит {float(max_exposure):.0f}"
            )

        daily_loss_pct = abs(self._stats["dailyPnL"]) / float(portfolio_value) if portfolio_value else 0
        if daily_loss_pct >= limits.get("maxDailyLoss", 0.1):
            validation["isValid"] = False
            validation["errors"].append(
                f"Дневной убыток {daily_loss_pct * 100:.1f}% превышает лимит"
            )

        if self._stats["consecutiveLosses"] >= limits.get("maxConsecutiveLosses", 10):
            validation["isValid"] = False
            validation["errors"].append(
                f"Слишком много убытков подряд: {self._stats['consecutiveLosses']}"
            )

        return validation
