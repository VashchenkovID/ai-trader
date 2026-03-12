"""
Обучение мета-модели стекинга поверх CondMLP.

Использование:
  python -m training.run_stacking --base-checkpoint ./models/python_nn/cond_mlp-xx.ckpt [--epochs 20] [--csv path]

Строит по каждому сэмплу вектор из 9×2 предсказаний базовой модели, обучает StackingModel,
сохраняет чекпоинт в models_root/stacking/.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import torch
from torch.utils.data import DataLoader, TensorDataset

from training.config import get_training_settings
from training.data.pipeline import build_feature_pipeline, time_based_split
from training.data.loaders import load_candles_from_csv
from training.inference_nn import load_cond_mlp
from training.models.nn import N_HORIZONS, N_STRATEGIES
from training.models.stacking import StackingModel, STACKING_INPUT_SIZE


def _synthetic_data(n_samples: int = 500, lookback: int = 60, horizon: int = 5):
    """Синтетические X, y для генерации мета-признаков."""
    import pandas as pd
    import numpy as np
    from training.run_nn import _candles_to_tensors
    dates = pd.date_range("2020-01-01", periods=n_samples + lookback + horizon, freq="D")
    close = 100 + np.cumsum(np.random.randn(len(dates)).astype(np.float32) * 0.5)
    volume = np.ones(len(dates), dtype=np.float32) * 1e6
    candles = pd.DataFrame({"close": close, "volume": volume}, index=dates)
    return _candles_to_tensors(candles, lookback=lookback, horizon=horizon)


def build_meta_features(base_model: torch.nn.Module, X: torch.Tensor, device: torch.device) -> torch.Tensor:
    """
    По тензору X (batch, n_features) строит тензор (batch, 18) из предсказаний
    базовой модели по всем 9 парам (strategy_id, horizon_id).
    """
    base_model.eval()
    meta_list: list[torch.Tensor] = []
    with torch.no_grad():
        for s in range(N_STRATEGIES):
            for h in range(N_HORIZONS):
                sid = torch.full((X.shape[0],), s, dtype=torch.long, device=device)
                hid = torch.full((X.shape[0],), h, dtype=torch.long, device=device)
                sc, cf = base_model(X, sid, hid)
                meta_list.append(sc)
                meta_list.append(cf)
    return torch.stack(meta_list, dim=1)


def run(
    base_checkpoint_path: str | Path,
    max_epochs: int = 20,
    batch_size: int = 32,
    lr: float = 1e-3,
    candles_df=None,
    lookback_days: int = 60,
    prediction_horizon: int = 5,
) -> str | None:
    """
    Обучает мета-модель стекинга. base_checkpoint_path — путь к чекпоинту CondMLP.
    Возвращает путь к сохранённому чекпоинту стекинга или None.
    """
    from training.run_nn import _candles_to_tensors
    import mlflow
    from training.experiments import init_mlflow

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    base_path = Path(base_checkpoint_path)
    if not base_path.is_file():
        return None

    base_model = load_cond_mlp(base_path)
    base_model.to(device)
    base_model.eval()

    if candles_df is not None and not candles_df.empty:
        X_t, y_t, s_t, h_t, X_v, y_v, s_v, h_v, X_te, y_te, s_te, h_te = _candles_to_tensors(
            candles_df, lookback=lookback_days, horizon=prediction_horizon
        )
    else:
        X_t, y_t, s_t, h_t, X_v, y_v, s_v, h_v, X_te, y_te, s_te, h_te = _synthetic_data(
            lookback=lookback_days, horizon=prediction_horizon
        )

    X_t = X_t.to(device)
    X_v = X_v.to(device)
    M_t = build_meta_features(base_model, X_t, device)
    M_v = build_meta_features(base_model, X_v, device)
    y_t = y_t.to(device)
    y_v = y_v.to(device)
    target_t = torch.clamp((1 + y_t) / 2, 0.0, 1.0)
    target_v = torch.clamp((1 + y_v) / 2, 0.0, 1.0)
    M_t = M_t.cpu()
    M_v = M_v.cpu()
    target_t = target_t.cpu()
    target_v = target_v.cpu()
    if len(M_t) == 0 or len(M_v) == 0:
        return None

    meta_model = StackingModel(input_size=STACKING_INPUT_SIZE).to(device)
    opt = torch.optim.Adam(meta_model.parameters(), lr=lr)
    train_ds = TensorDataset(M_t, target_t)
    val_ds = TensorDataset(M_v, target_v)
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size)
    if len(train_loader) == 0 or len(val_loader) == 0:
        return None

    best_val_loss = float("inf")
    best_path: str | None = None
    settings = get_training_settings()
    init_mlflow()
    mlflow.set_experiment(settings.mlflow_experiment_name)

    with mlflow.start_run(run_name="stacking") as run:
        mlflow.log_params({
            "base_checkpoint": str(base_path),
            "max_epochs": max_epochs,
            "batch_size": batch_size,
            "lr": lr,
        })
        for epoch in range(max_epochs):
            meta_model.train()
            train_loss = 0.0
            for mb, tb in train_loader:
                mb, tb = mb.to(device), tb.to(device)
                opt.zero_grad()
                score, conf = meta_model(mb)
                loss = torch.nn.functional.mse_loss(score, tb) + 0.1 * (1 - conf).mean()
                loss.backward()
                opt.step()
                train_loss += loss.item()
            train_loss /= len(train_loader)

            meta_model.eval()
            val_loss = 0.0
            with torch.no_grad():
                for mb, tb in val_loader:
                    mb, tb = mb.to(device), tb.to(device)
                    score, conf = meta_model(mb)
                    val_loss += torch.nn.functional.mse_loss(score, tb).item()
            val_loss /= len(val_loader) if len(val_loader) else 1

            if val_loss < best_val_loss:
                best_val_loss = val_loss
                out_dir = Path(settings.models_root) / "stacking"
                out_dir.mkdir(parents=True, exist_ok=True)
                best_path = str(out_dir / "stacking_meta.pt")
                torch.save({
                    "state_dict": meta_model.state_dict(),
                    "input_size": STACKING_INPUT_SIZE,
                }, best_path)
            if (epoch + 1) % 5 == 0:
                print(f"Epoch {epoch+1} train_loss={train_loss:.4f} val_loss={val_loss:.4f}")
        if best_path:
            mlflow.log_artifact(best_path)
    return best_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Train stacking meta-model on top of CondMLP")
    parser.add_argument("--base-checkpoint", type=str, required=True, help="Путь к чекпоинту CondMLP")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--csv", type=str, default=None)
    parser.add_argument("--lookback", type=int, default=60)
    parser.add_argument("--horizon", type=int, default=5)
    args = parser.parse_args()
    candles_df = None
    if args.csv:
        candles_df = load_candles_from_csv(args.csv)
        if candles_df.empty:
            raise SystemExit(f"Не удалось загрузить свечи из {args.csv}")
    path = run(
        base_checkpoint_path=args.base_checkpoint,
        max_epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        candles_df=candles_df,
        lookback_days=args.lookback,
        prediction_horizon=args.horizon,
    )
    print("Stacking checkpoint:", path)


if __name__ == "__main__":
    main()
