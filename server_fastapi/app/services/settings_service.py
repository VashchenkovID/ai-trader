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
            "analysis_v2_enabled": SettingItemDTO(
                key="analysis_v2_enabled",
                value=True,
                type="boolean",
                module="analysis",
                description="Флаг включения улучшенного анализа v2",
            ),
            "analysis_v2_canary_percent": SettingItemDTO(
                key="analysis_v2_canary_percent",
                value=20,
                type="number",
                module="analysis",
                description="Процент инструментов в canary-раскатке analysis v2",
                min=0,
                max=100,
            ),
            "analysis_v2_llm_uncertainty_margin": SettingItemDTO(
                key="analysis_v2_llm_uncertainty_margin",
                value=0.08,
                type="number",
                module="analysis",
                description="Окно неуверенности NN для условного вызова LLM",
            ),
            "analysis_v2_llm_cache_ttl_hours": SettingItemDTO(
                key="analysis_v2_llm_cache_ttl_hours",
                value=6,
                type="number",
                module="analysis",
                description="TTL кэша LLM-ответов (часы)",
            ),
            "analysis_v2_quality_gates_enabled": SettingItemDTO(
                key="analysis_v2_quality_gates_enabled",
                value=True,
                type="boolean",
                module="analysis",
                description="Включены ли quality gates перед inference",
            ),
            "analysis_v2_conf_temp_nn_only": SettingItemDTO(
                key="analysis_v2_conf_temp_nn_only",
                value=1.0,
                type="number",
                module="analysis",
                description="Temperature scaling для confidence в режиме nn_only",
            ),
            "analysis_v2_conf_temp_llm_only": SettingItemDTO(
                key="analysis_v2_conf_temp_llm_only",
                value=1.0,
                type="number",
                module="analysis",
                description="Temperature scaling для confidence в режиме llm_only",
            ),
            "analysis_v2_conf_temp_nn_llm": SettingItemDTO(
                key="analysis_v2_conf_temp_nn_llm",
                value=1.0,
                type="number",
                module="analysis",
                description="Temperature scaling для confidence в режиме nn_llm",
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
