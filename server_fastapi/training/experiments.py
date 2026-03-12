"""Регистрация экспериментов и артефактов в MLflow."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import mlflow
from mlflow.entities import ViewType

from training.config import get_training_settings


def init_mlflow(
    tracking_uri: str | None = None,
    experiment_name: str | None = None,
) -> str:
    """
    Инициализирует MLflow и создаёт/выбирает эксперимент. Возвращает experiment_id.
    """
    settings = get_training_settings()
    uri = tracking_uri or settings.mlflow_tracking_uri
    name = experiment_name or settings.mlflow_experiment_name
    mlflow.set_tracking_uri(uri)
    exp = mlflow.set_experiment(name)
    return exp.experiment_id


def log_run(
    run_name: str | None = None,
    params: dict[str, Any] | None = None,
    metrics: dict[str, float] | None = None,
    artifact_path: str | Path | None = None,
    tags: dict[str, str] | None = None,
) -> str | None:
    """
    Логирует один run в текущем эксперименте. Возвращает run_id или None при ошибке.
    """
    try:
        init_mlflow()
        with mlflow.start_run(run_name=run_name, tags=tags) as run:
            if params:
                mlflow.log_params(params)
            if metrics:
                mlflow.log_metrics(metrics)
            if artifact_path and os.path.isdir(str(artifact_path)):
                mlflow.log_artifacts(str(artifact_path))
            elif artifact_path and os.path.isfile(str(artifact_path)):
                mlflow.log_artifact(str(artifact_path))
            return run.info.run_id
    except Exception:
        return None


def get_latest_run_id(experiment_name: str | None = None) -> str | None:
    """Возвращает run_id последнего успешного run в эксперименте."""
    exp_id = init_mlflow(experiment_name=experiment_name)
    mlflow.set_tracking_uri(get_training_settings().mlflow_tracking_uri)
    runs = mlflow.search_runs(
        experiment_ids=[exp_id],
        order_by=["start_time DESC"],
        max_results=1,
        run_view_type=ViewType.ACTIVE_ONLY,
    )
    if runs.empty:
        return None
    return runs.iloc[0]["run_id"]
