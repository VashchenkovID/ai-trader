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
    rate_limit_max: int = Field(default=100000, alias="RATE_LIMIT_MAX")

    # Wave 3: AI/ML background jobs
    training_full_cron: str = Field(default="0 3 * * 1", description="Cron: полное обучение")
    training_quick_cron: str = Field(default="0 8,10,12,14,16,18 * * *", description="Cron: быстрое обучение")
    market_analysis_cron: str = Field(default="0 * * * *", description="Cron: анализ рынка и портфеля")
    weekly_generation_cron: str = Field(default="0 8 * * *", description="Cron: генерация weekly forecast")
    weekly_update_cron: str = Field(default="0 9 * * *", description="Cron: обновление weekly forecast")
    weekly_training_cron: str = Field(default="0 4 * * 1", description="Cron: weekly training")

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


@lru_cache
def get_settings() -> Settings:
    """Возвращает закешированный объект настроек, чтобы не пересоздавать его на каждый запрос."""
    return Settings()
