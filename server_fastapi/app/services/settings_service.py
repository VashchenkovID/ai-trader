from app.schemas.platform import KellySettingsDTO, SettingItemDTO


class SettingsService:
    """In-memory хранилище системных настроек и параметров Келли для Phase 1."""
    def __init__(self) -> None:
        """Инициализирует набор дефолтных настроек для совместимости платформенных API."""
        self._settings: dict[str, SettingItemDTO] = {
            "trading_mode": SettingItemDTO(
                key="trading_mode",
                value="paper",
                type="string",
                module="trading",
                description="Режим торговли: paper, real, micro",
            ),
            "auto_paper_enabled": SettingItemDTO(
                key="auto_paper_enabled",
                value=False,
                type="boolean",
                module="trading",
                description="Включена ли автоматическая торговля в paper-режиме",
            ),
            "auto_paper_phase": SettingItemDTO(
                key="auto_paper_phase",
                value="phase1",
                type="string",
                module="trading",
                description="Текущая фаза auto-paper: phase1, phase2, phase3",
            ),
            "system.mode": SettingItemDTO(
                key="system.mode",
                value="paper",
                type="string",
                module="system",
                description="Current trading mode",
            ),
            "risk.maxPositionSize": SettingItemDTO(
                key="risk.maxPositionSize",
                value=0.1,
                type="number",
                module="risk",
                description="Maximum position size fraction",
                min=0.0,
                max=1.0,
            ),
        }
        self._kelly = KellySettingsDTO()

    def get_all(self, *, offset: int = 0, limit: int = 200) -> tuple[list[SettingItemDTO], int]:
        """Возвращает все настройки в формате API."""
        items = list(self._settings.values())
        return items[offset : offset + limit], len(items)

    def update(self, key: str, value: object) -> SettingItemDTO:
        """Обновляет одну настройку по ключу или создает новую, если ключа нет."""
        current = self._settings.get(key)
        if current is None:
            current = SettingItemDTO(key=key, value=value)
        else:
            current = current.model_copy(update={"value": value})
        self._settings[key] = current
        return current

    def get_kelly(self) -> KellySettingsDTO:
        """Возвращает текущий набор параметров формулы Келли."""
        return self._kelly

    def update_kelly(self, updates: dict[str, object]) -> KellySettingsDTO:
        """Частично обновляет параметры Келли и возвращает актуальное состояние."""
        self._kelly = self._kelly.model_copy(update=updates)
        return self._kelly
