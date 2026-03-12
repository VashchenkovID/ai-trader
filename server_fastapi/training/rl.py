"""
Контур обучения с подкреплением (RL).

Реализован легковесный tabular Q-learning без внешних RL-библиотек:
- состояние: режим доходности (bear / flat / bull),
- действия: HOLD / BUY / SELL,
- награда: доходность позиции минус транзакционные издержки при смене позиции.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json

import numpy as np

from training.config import get_training_settings

__all__ = ["train_agent"]


def _state_from_return(r: float) -> int:
    """Дискретизация доходности в 3 состояния рынка."""
    if r < -0.002:
        return 0  # bear
    if r > 0.002:
        return 2  # bull
    return 1  # flat


def _action_to_position(action: int) -> int:
    """Преобразование действия агента в позицию."""
    if action == 1:
        return 1  # long
    if action == 2:
        return -1  # short
    return 0  # hold/cash


def train_agent(
    env_name: str = "paper",
    total_steps: int = 10_000,
    checkpoint_dir: str | None = None,
    *,
    seed: int = 42,
    alpha: float = 0.05,
    gamma: float = 0.95,
    epsilon_start: float = 0.30,
    epsilon_end: float = 0.02,
    trade_cost: float = 0.0005,
    continue_from_latest: bool = False,
) -> str | None:
    """
    Обучает tabular Q-learning агента и сохраняет артефакт в JSON.
    Возвращает путь к сохраненному "чекпоинту" политики.
    """
    steps = int(total_steps)
    if steps < 100:
        steps = 100

    rng = np.random.default_rng(seed)
    # Генерируем синтетический ряд доходностей: малый шум + редкие более сильные движения.
    returns = rng.normal(loc=0.0002, scale=0.006, size=steps + 1)
    shocks = rng.choice([0.0, -0.02, 0.02], size=steps + 1, p=[0.98, 0.01, 0.01])
    returns = returns + shocks

    n_states, n_actions = 3, 3
    settings = get_training_settings()
    root = Path(checkpoint_dir or settings.models_root) / "rl"
    root.mkdir(parents=True, exist_ok=True)
    q_table = np.zeros((n_states, n_actions), dtype=np.float64)
    if continue_from_latest:
        latest = sorted(root.glob("q_agent_*.json"), key=lambda p: p.stat().st_mtime)
        if latest:
            try:
                with latest[-1].open("r", encoding="utf-8") as f:
                    prev = json.load(f)
                prev_q = np.array(prev.get("q_table", []), dtype=np.float64)
                if prev_q.shape == (n_states, n_actions):
                    q_table = prev_q
            except Exception:
                pass
    actions_count = np.zeros(n_actions, dtype=np.int64)

    total_reward = 0.0
    prev_position = 0

    for step in range(steps):
        epsilon = epsilon_start + (epsilon_end - epsilon_start) * (step / max(1, steps - 1))
        state = _state_from_return(float(returns[step]))
        next_state = _state_from_return(float(returns[step + 1]))

        if rng.random() < epsilon:
            action = int(rng.integers(0, n_actions))
        else:
            action = int(np.argmax(q_table[state]))
        actions_count[action] += 1

        position = _action_to_position(action)
        cost = trade_cost if position != prev_position else 0.0
        reward = float(position * returns[step + 1] - cost)
        total_reward += reward

        best_next = float(np.max(q_table[next_state]))
        q_table[state, action] += alpha * (reward + gamma * best_next - q_table[state, action])
        prev_position = position

    policy = [int(np.argmax(q_table[s])) for s in range(n_states)]
    mean_reward = total_reward / steps
    action_distribution = {
        "HOLD": float(actions_count[0] / steps),
        "BUY": float(actions_count[1] / steps),
        "SELL": float(actions_count[2] / steps),
    }

    out_path = root / f"q_agent_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"
    payload = {
        "env_name": env_name,
        "total_steps": steps,
        "seed": seed,
        "hyperparams": {
            "alpha": alpha,
            "gamma": gamma,
            "epsilon_start": epsilon_start,
            "epsilon_end": epsilon_end,
            "trade_cost": trade_cost,
        },
        "stats": {
            "mean_reward": mean_reward,
            "total_reward": total_reward,
            "action_distribution": action_distribution,
        },
        "policy": policy,
        "q_table": q_table.tolist(),
        "state_mapping": {"0": "bear", "1": "flat", "2": "bull"},
        "action_mapping": {"0": "HOLD", "1": "BUY", "2": "SELL"},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return str(out_path)
