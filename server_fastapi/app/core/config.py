from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Централизованные настройки приложения из `.env` и переменных окружения."""
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "ai-trader-fastapi"
    environment: str = "local"
    api_prefix: str = "/api/v1"
    log_level: str = "INFO"
    server_timezone: str = Field(default="Europe/Moscow", alias="SERVER_TIMEZONE")
    error_registry_path: str = Field(default="./logs/error_registry.json", alias="ERROR_REGISTRY_PATH")
    runtime_error_log_path: str = Field(default="./logs/runtime_errors.jsonl", alias="RUNTIME_ERROR_LOG_PATH")
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/ai_trader"
    )
    user_password: str | None = Field(default=None, alias="USER_PASSWORD")
    jwt_secret: str = Field(
        default="change-me-development-jwt-secret-minimum-32-chars",
        alias="JWT_SECRET",
    )
    jwt_expires_in: str = Field(default="7d", alias="JWT_EXPIRES_IN")
    port: int = Field(default=8000, alias="PORT")
    frontend_url: str = Field(default="", alias="FRONTEND_URL")

    # Tinkoff Invest API (Фаза 5)
    tinkoff_api_url: str = Field(
        default="https://invest-public-api.tinkoff.ru/rest",
        description="Базовый URL Tinkoff Invest API",
    )
    tinkoff_token: str = Field(default="", description="Токен доступа к Tinkoff Invest API")
    tinkoff_account_id: str = Field(default="", description="ID счёта для операций")
    tinkoff_verify_ssl: bool = Field(default=True, alias="TINKOFF_VERIFY_SSL")
    tinkoff_grpc_url: str = Field(default="invest-public-api.tinkoff.ru:443", alias="TINKOFF_GRPC_URL")
    tinkoff_sandbox: bool = Field(default=False, alias="TINKOFF_SANDBOX")
    tinkoff_scheduler_enabled: bool = Field(default=True, description="Включить планировщик задач Tinkoff")
    tinkoff_portfolio_sync_cron: str = Field(default="*/15 * * * *", description="Cron: синхронизация портфеля (каждые 15 мин)")
    tinkoff_instruments_cron: str = Field(default="0 */2 * * *", description="Cron: обновление инструментов (каждые 2 часа)")
    tinkoff_prices_cron: str = Field(default="0 */1 * * *", description="Cron: обновление последних цен (каждый час)")

    # Wave 2/3: фоновые data update jobs (non-news)
    cache_update_cron: str = Field(default="0 */2 * * *", description="Cron: инкрементальное обновление кеша")
    cache_full_update_cron: str = Field(default="0 3 * * *", description="Cron: полное обновление кеша/данных")
    market_refresh_cron: str = Field(default="*/30 * * * *", description="Cron: refresh рыночных данных")
    assets_sync_cron: str = Field(default="0 4 * * *", description="Cron: синхронизация ассетов")
    fundamental_sync_cron: str = Field(default="0 2 1,15 * *", description="Cron: фундаментальные данные")
    macro_update_cron: str = Field(default="0 10 * * *", description="Cron: макроэкономические данные")
    signals_update_cron: str = Field(default="0 6 * * *", description="Cron: обновление сигналов")
    options_update_cron: str = Field(default="0 7 * * *", description="Cron: обновление опционных данных")
    trading_windows_update_cron: str = Field(default="*/5 * * * *", description="Cron: обновление торговых окон")
    cache_cleanup_cron: str = Field(default="0 0 * * *", alias="CACHE_CLEANUP_CRON")
    portfolio_sync_enabled: bool = Field(default=True, alias="PORTFOLIO_SYNC_ENABLED")
    portfolio_sync_interval: int = Field(default=300000, alias="PORTFOLIO_SYNC_INTERVAL")
    portfolio_auto_update_prices: bool = Field(default=True, alias="PORTFOLIO_AUTO_UPDATE_PRICES")
    portfolio_sync_history: bool = Field(default=True, alias="PORTFOLIO_SYNC_HISTORY")
    user_max_portfolio_budget: float = Field(default=1_000_000, alias="USER_MAX_PORTFOLIO_BUDGET")
    max_position_size: float = Field(default=0.02, alias="MAX_POSITION_SIZE")
    max_drawdown: float = Field(default=0.15, alias="MAX_DRAWDOWN")
    min_confidence: float = Field(default=0.6, alias="MIN_CONFIDENCE")
    disable_rate_limit: bool = Field(default=False, alias="DISABLE_RATE_LIMIT")
    rate_limit_max: int = Field(default=100000, ge=0, alias="RATE_LIMIT_MAX")
    rate_limit_window_seconds: int = Field(default=60, ge=1, alias="RATE_LIMIT_WINDOW_SECONDS")
    slo_alert_min_samples: int = Field(default=20, ge=1, alias="SLO_ALERT_MIN_SAMPLES")
    trusted_hosts: str = Field(
        default="",
        alias="TRUSTED_HOSTS",
        description="Список разрешённых Host через запятую; пусто — middleware отключён",
    )
    expose_root_metrics: bool = Field(default=True, alias="EXPOSE_ROOT_METRICS")
    metrics_auth_token: str | None = Field(default=None, alias="METRICS_AUTH_TOKEN")

    # Wave 3: AI/ML background jobs
    training_full_cron: str = Field(default="0 3 * * 1", description="Cron: полное обучение")
    training_quick_cron: str = Field(default="0 8,10,12,14,16,18 * * *", description="Cron: быстрое обучение")
    market_analysis_cron: str = Field(default="0 * * * *", description="Cron: анализ рынка и портфеля")
    llm_jury_batch_size: int = Field(
        default=45,
        ge=1,
        le=500,
        alias="LLM_JURY_BATCH_SIZE",
        description="Сколько FIGI в одном батч-промпте LLM-жюри в analysis_market_portfolio",
    )
    # Ops + Cutover (Фаза 6)
    cutover_backup_dir: str = Field(
        default="./data/cutover_backups",
        description="Каталог для snapshot/backup артефактов cutover",
    )
    cutover_backup_rollup_path: str = Field(
        default="./data/cutover_backups/cutover_backups.jsonl",
        alias="CUTOVER_BACKUP_ROLLUP_PATH",
    )
    cutover_backup_keep_raw: int = Field(default=5, alias="CUTOVER_BACKUP_KEEP_RAW")
    lightning_logs_dir: str = Field(default="./lightning_logs", alias="LIGHTNING_LOGS_DIR")
    lightning_rollup_path: str = Field(default="./logs/lightning_runs.jsonl", alias="LIGHTNING_ROLLUP_PATH")
    lightning_keep_raw: int = Field(default=3, alias="LIGHTNING_KEEP_RAW")

    # Telegram subsystem parity
    telegram_enabled: bool = Field(default=False, alias="TELEGRAM_ENABLED")
    telegram_bot_token: str = Field(default="", alias="TELEGRAM_BOT_TOKEN")
    telegram_chat_id: str = Field(default="", alias="TELEGRAM_CHAT_ID")
    telegram_api_id: str = Field(default="", alias="TELEGRAM_API_ID")
    telegram_api_hash: str = Field(default="", alias="TELEGRAM_API_HASH")

    # External providers / compatibility env
    news_api_key: str = Field(default="", alias="NEWS_API_KEY")
    alpha_vantage_api_key: str = Field(default="", alias="ALPHA_VANTAGE_API_KEY")
    deepseek_api_key: str = Field(default="", alias="DEEPSEEK_API_KEY")
    perplexity_api_key: str = Field(default="", alias="PERPLEXITY_API_KEY")
    gigachat_client_id: str = Field(default="", alias="GIGACHAT_CLIENT_ID")
    gigachat_client_secret: str = Field(default="", alias="GIGACHAT_CLIENT_SECRET")
    yandex_api_key: str = Field(default="", alias="YANDEX_API_KEY")
    yandex_folder_id: str = Field(default="", alias="YANDEX_FOLDER_ID")
    idencefier: str = Field(default="", alias="idencefier")

    # Торговые заявки: синтетические FIGI вида TEST-… (тесты/разработка). В проде выключить.
    allow_synthetic_trading_figi: bool = Field(default=True, alias="ALLOW_SYNTHETIC_TRADING_FIGI")

    # Лог траекторий paper (MDP) для калибровки / offline RL — см. training/METRICS.md
    paper_mdp_log_enabled: bool = Field(default=True, alias="PAPER_MDP_LOG_ENABLED")
    paper_mdp_log_path: str = Field(default="./logs/paper_mdp.jsonl", alias="PAPER_MDP_LOG_PATH")

    # Исследовательские заявки в paper по HOLD с высоким score (только mode=paper)
    paper_exploration_enabled: bool = Field(default=False, alias="PAPER_EXPLORATION_ENABLED")
    paper_exploration_max_extra: int = Field(default=0, ge=0, alias="PAPER_EXPLORATION_MAX_EXTRA")
    paper_exploration_min_score: float = Field(default=0.55, ge=0.0, le=1.0, alias="PAPER_EXPLORATION_MIN_SCORE")
    paper_exploration_action: str = Field(default="BUY", alias="PAPER_EXPLORATION_ACTION")

    # Мягкие пороги pipeline заявок только при mode=paper (если API не передал свои)
    paper_pipeline_min_confidence: float = Field(
        default=0.35, ge=0.0, le=1.0, alias="PAPER_PIPELINE_MIN_CONFIDENCE"
    )
    paper_pipeline_min_score: float = Field(
        default=0.35, ge=0.0, le=1.0, alias="PAPER_PIPELINE_MIN_SCORE"
    )
    paper_soft_use_db_columns: bool = Field(
        default=True,
        alias="PAPER_SOFT_USE_DB_COLUMNS",
        description="В mode=paper использовать колонки paper_* из БД при отборе заявок (после миграции). False — только основной сигнал.",
    )
    paper_soft_hold_to_buy: bool = Field(default=False, alias="PAPER_SOFT_HOLD_TO_BUY")

    # Ожидаемый сдвиг real vs paper — см. training/REAL_TRANSFER.md
    real_slippage_bps: int = Field(default=10, ge=0, alias="REAL_SLIPPAGE_BPS")
    real_execution_delay_ms: int = Field(default=0, ge=0, alias="REAL_EXECUTION_DELAY_MS")
    real_calibration_log_enabled: bool = Field(default=True, alias="REAL_CALIBRATION_LOG_ENABLED")

    # gRPC T-Invest (опционально; REST по умолчанию)
    tinkoff_use_grpc: bool = Field(default=False, alias="TINKOFF_USE_GRPC")
    broker_hint_after_manual_execute: bool = Field(
        default=False,
        alias="BROKER_HINT_AFTER_MANUAL_EXECUTE",
        description="После EXECUTED из PENDING_MANUAL_REAL вызвать GetOperations для телеметрии",
    )
    paper_pipeline_multi_profile: bool = Field(
        default=False,
        alias="PAPER_PIPELINE_MULTI_PROFILE",
        description="Создавать paper-заявки по всем виртуальным профилям без дубля (figi+slug)",
    )
    # Авто-пайплайн заявок после analysis_portfolio_positions (только paper в планировщике)
    ppr_manual_reuse_ttl_hours: int = Field(
        default=168,
        ge=0,
        alias="PPR_MANUAL_REUSE_TTL_HOURS",
        description=(
            "Сколько часов вердикт из ручного импорта (manual/apply) считать свежим: "
            "run_verdict не вызывает GigaChat по этим FIGI; 0 — не переиспользовать ручные"
        ),
    )
    ppr_auto_pipeline_enabled: bool = Field(
        default=False,
        alias="PPR_AUTO_PIPELINE_ENABLED",
        description="После run_verdict вызывать PortfolioPositionPipelineService для каждого scope",
    )
    ppr_pipeline_min_confidence: float = Field(
        default=0.22,
        ge=0.0,
        le=1.0,
        alias="PPR_PIPELINE_MIN_CONFIDENCE",
        description="Мин. final_confidence для отбора в PPR pipeline (paper)",
    )
    ppr_pipeline_min_score: float = Field(
        default=0.22,
        ge=0.0,
        le=1.0,
        alias="PPR_PIPELINE_MIN_SCORE",
        description="Мин. эффективный score (max рынок, final_confidence) для отбора в PPR pipeline",
    )
    ppr_pipeline_use_profile_gate: bool = Field(
        default=False,
        alias="PPR_PIPELINE_USE_PROFILE_GATE",
        description=(
            "True: к порогам выше добавить max(signal_min_* профиля scope). "
            "False: только PPR_PIPELINE_MIN_* (рекомендуется для портфельных SELL)"
        ),
    )
    ppr_pipeline_bump_signal_to_profile_floor: bool = Field(
        default=True,
        alias="PPR_PIPELINE_BUMP_SIGNAL_TO_PROFILE_FLOOR",
        description=(
            "Перед create_from_data поднять confidence и score до signal_min_* профиля, "
            "если ниже — иначе auto-paper часто отклоняет заявку после создания"
        ),
    )
    risk_real_cap_preview_enabled: bool = Field(
        default=False,
        alias="RISK_REAL_CAP_PREVIEW_ENABLED",
        description="GET /risk/real-cap-preview/{figi} включает cap из PyPortfolioOpt",
    )
    indicators_api_enabled: bool = Field(
        default=False,
        alias="INDICATORS_API_ENABLED",
        description="POST /quant/indicators-preview по FIGI",
    )
    portfolio_profiles_yaml_path: str = Field(
        default="",
        alias="PORTFOLIO_PROFILES_YAML_PATH",
        description="Опциональный YAML профилей; пусто — только БД",
    )
    audit_log_path: str = Field(default="./logs/audit.jsonl", alias="AUDIT_LOG_PATH")
    training_alignment_dataset_path: str = Field(
        default="./data/training/alignment_dataset.jsonl",
        alias="TRAINING_ALIGNMENT_DATASET_PATH",
    )
    training_alignment_cron: str = Field(
        default="0 5 * * 0",
        alias="TRAINING_ALIGNMENT_CRON",
        description="Cron: append строки alignment row в JSONL (§7)",
    )

    # Ночной артефакт матрицы доходностей (заглушка-планировщик, см. scheduler)
    quant_returns_matrix_cron: str = Field(default="0 3 * * *", description="Cron: артефакт returns matrix")
    virtual_portfolio_nav_cron: str = Field(
        default="30 23 * * *",
        description="Cron: дневной снимок NAV виртуальных профилей (Europe/Moscow)",
    )
    completed_tasks_cleanup_cron: str = Field(
        default="0 * * * *",
        alias="COMPLETED_TASKS_CLEANUP_CRON",
        description="Cron: удаление завершённых записей из in-memory реестра фоновых задач",
    )


@lru_cache
def get_settings() -> Settings:
    """Возвращает закешированный объект настроек, чтобы не пересоздавать его на каждый запрос."""
    return Settings()
