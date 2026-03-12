"""Настройки для контуров обучения (Phase 4)."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class TrainingSettings(BaseSettings):
    """Настройки обучения: MLflow, пути к данным, логирование."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="TRAINING_",
        extra="ignore",
    )

    mlflow_tracking_uri: str = Field(
        default="file:./mlruns",
        description="URI хранилища MLflow (file:./mlruns или http://host:5000)",
    )
    mlflow_experiment_name: str = Field(
        default="ai-trader-training",
        description="Имя эксперимента MLflow по умолчанию",
    )
    data_cache_dir: str = Field(
        default="./data/cache",
        description="Каталог кеша сырых данных (свечи, макро и т.д.)",
    )
    artifacts_dir: str = Field(
        default="./data/artifacts",
        description="Каталог артефактов обучения (датасеты и прочее)",
    )
    models_root: str = Field(
        default="./models",
        description="Корень каталога моделей. Чекпоинты NN — models_root/python_nn/, weekly — models_root/weekly/.",
    )
    ensemble_weights_path: str | None = Field(
        default=None,
        description="Путь к JSON с весами ансамбля (horizon_weights, strategy_weights). Если не задан — равные веса.",
    )
    release_registry_path: str = Field(
        default="./models/release_registry.jsonl",
        description="Путь к JSONL-реестру решений release-gate.",
    )
    release_min_trades: int = Field(default=30, description="Минимум сделок для промоута модели")
    release_min_win_rate: float = Field(default=0.50, description="Минимальный win-rate для промоута")
    release_min_profit_factor: float = Field(
        default=1.05,
        description="Минимальный profit factor для промоута",
    )
    release_min_sharpe: float = Field(default=0.30, description="Минимальный Sharpe для промоута")
    release_max_drawdown: float = Field(
        default=0.25,
        description="Максимально допустимая просадка (доля от 0 до 1)",
    )
    release_min_consistency: float = Field(
        default=0.50,
        description="Минимальная консистентность OOS-результатов для промоута",
    )
    log_level: str = Field(default="INFO", description="Уровень логирования воркеров обучения")
    lightning_logs_dir: str = Field(
        default="./lightning_logs",
        description="Каталог сырых логов PyTorch Lightning (version_*).",
    )
    lightning_rollup_path: str = Field(
        default="./logs/lightning_runs.jsonl",
        description="Rolling JSONL журнал запусков обучения.",
    )
    lightning_keep_raw: int = Field(
        default=3,
        description="Сколько последних version_* директорий Lightning хранить после pruning.",
    )


@lru_cache
def get_training_settings() -> TrainingSettings:
    """Возвращает закешированные настройки обучения."""
    return TrainingSettings()
