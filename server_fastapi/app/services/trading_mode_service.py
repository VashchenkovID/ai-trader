from app.services.settings_service import SettingsService


_ALLOWED_MODES = frozenset({"paper", "real", "micro"})


class TradingModeService:
    """Сервис управления режимом торговли."""

    def __init__(self, settings_service: SettingsService) -> None:
        self._settings = settings_service

    def get_current_mode(self) -> str:
        """Возвращает текущий режим торговли."""
        item = self._settings._settings.get("trading_mode")
        if item is None:
            return "paper"
        val = item.value
        return str(val) if val in _ALLOWED_MODES else "paper"

    def can_switch_to(self, mode: str) -> dict[str, object]:
        """Проверяет возможность переключения на указанный режим."""
        if mode not in _ALLOWED_MODES:
            return {"allowed": False, "reason": f"Недопустимый режим: {mode}"}
        if mode == "paper":
            return {"allowed": True, "reason": None}
        if mode == "real":
            # Упрощённая проверка: для real требуется явная валидация (Phase 4).
            return {"allowed": True, "reason": None}
        return {"allowed": True, "reason": None}

    def switch_mode(self, mode: str) -> dict[str, object]:
        """Переключает режим торговли."""
        can = self.can_switch_to(mode)
        if not can.get("allowed", False):
            from app.core.errors import AppError
            raise AppError(
                "BUSINESS_RULE_VIOLATION",
                message=can.get("reason") or "Переключение запрещено",
            )
        previous = self.get_current_mode()
        self._settings.update("trading_mode", mode)
        return {"mode": mode, "previousMode": previous}
