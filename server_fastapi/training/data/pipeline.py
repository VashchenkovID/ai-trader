"""
Пайплайн подготовки фичей для обучения.

Аналог Node: prepareTrainingData + createFeatureVector.
Вход: свечи, макро, фундаментал, опционы, дивиденды (и опционально агрегаты LLM-жюри).
Выход: таблица фичей и меток, готовая для time-based сплита и подачи в модель.
Запрет look-ahead: при построении фичей и меток не используются будущие данные.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def build_feature_pipeline(
    candles: pd.DataFrame,
    macro: pd.DataFrame | None = None,
    fundamental: pd.DataFrame | None = None,
    options: pd.DataFrame | None = None,
    dividends: pd.DataFrame | None = None,
    llm_aggregates: pd.DataFrame | None = None,
    lookback_days: int = 60,
    prediction_horizon: int = 5,
) -> tuple[pd.DataFrame, pd.Series]:
    """
    Строит таблицу фичей и меток по историческим данным.

    Фичи на дату t используют только данные до t (включительно). Метка —
    доходность или направление движения на горизонте [t+1 .. t+prediction_horizon].

    Args:
        candles: OHLCV по дням (индекс — дата).
        macro: макро-индикаторы по датам (опционально).
        fundamental: мультипликаторы по датам (опционально).
        options: опционы/IV по датам (опционально).
        dividends: дивиденды по датам (опционально).
        llm_aggregates: агрегаты LLM-жюри (консенсус, уверенность, дисперсия) по датам (опционально).
        lookback_days: окно истории для одной строки фичей.
        prediction_horizon: горизонт предсказания (дней).

    Returns:
        (X, y): X — DataFrame фичей, y — метки (индекс совпадает с X).
    """
    if candles.empty or len(candles) < lookback_days + prediction_horizon:
        return pd.DataFrame(), pd.Series(dtype=float)

    # Минимальная реализация: фичи из свечей (returns, volume), метка — forward return
    if not isinstance(candles.index, pd.DatetimeIndex):
        candles = candles.copy()
        candles.index = pd.to_datetime(candles.index)
    candles = candles.sort_index()

    # Простые фичи: доходность за 1, 5, 20 дней, объём (нормализованный)
    close = candles["close"] if "close" in candles.columns else candles.iloc[:, 3]
    volume = candles["volume"] if "volume" in candles.columns else pd.Series(1.0, index=candles.index)
    ret1 = close.pct_change(1)
    ret5 = close.pct_change(5)
    ret20 = close.pct_change(20)
    vol_norm = volume / (volume.rolling(20, min_periods=1).mean() + 1e-8)

    rows: list[dict[str, Any]] = []
    for i in range(lookback_days, len(candles) - prediction_horizon):
        t = candles.index[i]
        # Фичи: только прошлое (look-ahead запрещён)
        row = {
            "date": t,
            "ret1": ret1.iloc[i],
            "ret5": ret5.iloc[i],
            "ret20": ret20.iloc[i],
            "vol_norm": vol_norm.iloc[i],
        }
        # Метка: доходность в будущем (с t+1 по t+prediction_horizon)
        future_ret = (close.iloc[i + prediction_horizon] / close.iloc[i + 1]) - 1.0
        row["_target"] = future_ret
        rows.append(row)

    df = pd.DataFrame(rows)
    if df.empty:
        return pd.DataFrame(), pd.Series(dtype=float)
    df = df.set_index("date")
    y = df["_target"].copy()
    X = df.drop(columns=["_target"])

    # Присоединение агрегатов LLM-жюри по дате (последняя доступная на или до даты строки фичей)
    if llm_aggregates is not None and not llm_aggregates.empty:
        agg = llm_aggregates.copy()
        if not isinstance(agg.index, pd.DatetimeIndex):
            if "date" in agg.columns:
                agg = agg.set_index("date")
            else:
                return X, y
        agg.index = pd.to_datetime(agg.index)
        agg = agg.sort_index()
        # Ожидаемые колонки: consensus, dispersion; confidence или confidence_avg
        col_map = {}
        if "consensus" in agg.columns:
            col_map["consensus"] = "llm_consensus"
        if "dispersion" in agg.columns:
            col_map["dispersion"] = "llm_dispersion"
        if "confidence_avg" in agg.columns:
            col_map["confidence_avg"] = "llm_confidence_avg"
        elif "confidence" in agg.columns:
            col_map["confidence"] = "llm_confidence_avg"
        if not col_map:
            return X, y
        agg = agg[[c for c in col_map]].rename(columns=col_map)
        # merge_asof: для каждой даты в X взять последнюю доступную строку из agg (на или до этой даты)
        X = pd.merge_asof(
            X.sort_index(),
            agg.sort_index(),
            left_index=True,
            right_index=True,
            direction="backward",
        )
        # заполнить пропуски нейтральными значениями (консенсус 0.5, дисперсия 0)
        for c in ["llm_consensus", "llm_confidence_avg", "llm_dispersion"]:
            if c in X.columns:
                X[c] = X[c].fillna(0.5 if c != "llm_dispersion" else 0.0)

    return X, y


def time_based_split(
    X: pd.DataFrame,
    y: pd.Series,
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
) -> tuple[pd.DataFrame, pd.Series, pd.DataFrame, pd.Series, pd.DataFrame, pd.Series]:
    """
    Сплит по времени (без shuffle). Индексы должны быть отсортированы по дате.

    Returns:
        (X_train, y_train, X_val, y_val, X_test, y_test)
    """
    if X.empty or len(X) < 3:
        return (
            pd.DataFrame(), pd.Series(dtype=float),
            pd.DataFrame(), pd.Series(dtype=float),
            pd.DataFrame(), pd.Series(dtype=float),
        )
    n = len(X)
    t1 = int(n * train_ratio)
    t2 = int(n * (train_ratio + val_ratio))
    X_train, X_val, X_test = X.iloc[:t1], X.iloc[t1:t2], X.iloc[t2:]
    y_train = y.loc[X_train.index]
    y_val = y.loc[X_val.index]
    y_test = y.loc[X_test.index]
    return X_train, y_train, X_val, y_val, X_test, y_test


def _daily_features_from_candles(
    candles: pd.DataFrame,
    llm_aggregates: pd.DataFrame | None = None,
) -> tuple[pd.DataFrame, pd.Series]:
    """
    Строит одну строку фичей на каждую дату (без скользящего окна).
    Минимальный индекс дня — 20 (для ret20). Возвращает (features_df, close_series) для согласования с индексами.
    """
    close = candles["close"] if "close" in candles.columns else candles.iloc[:, 3]
    volume = candles["volume"] if "volume" in candles.columns else pd.Series(1.0, index=candles.index)
    ret1 = close.pct_change(1)
    ret5 = close.pct_change(5)
    ret20 = close.pct_change(20)
    vol_norm = volume / (volume.rolling(20, min_periods=1).mean() + 1e-8)
    min_idx = 20
    rows: list[dict[str, Any]] = []
    for i in range(min_idx, len(candles)):
        t = candles.index[i]
        row = {
            "date": t,
            "ret1": ret1.iloc[i],
            "ret5": ret5.iloc[i],
            "ret20": ret20.iloc[i],
            "vol_norm": vol_norm.iloc[i],
        }
        rows.append(row)
    daily = pd.DataFrame(rows).set_index("date")
    if llm_aggregates is not None and not llm_aggregates.empty:
        agg = llm_aggregates.copy()
        if not isinstance(agg.index, pd.DatetimeIndex) and "date" in agg.columns:
            agg = agg.set_index("date")
        if isinstance(agg.index, pd.DatetimeIndex):
            agg.index = pd.to_datetime(agg.index)
            agg = agg.sort_index()
            col_map = {}
            if "consensus" in agg.columns:
                col_map["consensus"] = "llm_consensus"
            if "dispersion" in agg.columns:
                col_map["dispersion"] = "llm_dispersion"
            if "confidence_avg" in agg.columns:
                col_map["confidence_avg"] = "llm_confidence_avg"
            elif "confidence" in agg.columns:
                col_map["confidence"] = "llm_confidence_avg"
            if col_map:
                agg = agg[[c for c in col_map]].rename(columns=col_map)
                daily = pd.merge_asof(
                    daily.sort_index(),
                    agg.sort_index(),
                    left_index=True,
                    right_index=True,
                    direction="backward",
                )
                for c in ["llm_consensus", "llm_confidence_avg", "llm_dispersion"]:
                    if c in daily.columns:
                        daily[c] = daily[c].fillna(0.5 if c != "llm_dispersion" else 0.0)
    close_aligned = close.iloc[min_idx:]
    return daily, close_aligned


def build_weekly_sequences(
    candles: pd.DataFrame,
    llm_aggregates: pd.DataFrame | None = None,
    seq_len: int = 30,
    n_forecast: int = 5,
    lookback_days: int = 60,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Строит последовательности для WeeklyForecastLSTM: скользящее окно фичей и метка на n_forecast дней вперёд.

    Фичи на дату t используют только данные до t (включительно). Метка — forward return
    за [t+1 .. t+n_forecast]. Запрет look-ahead.

    Args:
        candles: OHLCV по дням (индекс — дата).
        llm_aggregates: агрегаты LLM-жюри по датам (опционально).
        seq_len: длина последовательности (дней).
        n_forecast: горизонт прогноза (дней).
        lookback_days: не используется в расчёте, оставлен для совместимости API.

    Returns:
        (X_seq, y): X_seq — (n_samples, seq_len, n_features), y — (n_samples,) forward return.
    """
    if candles.empty or len(candles) < 20 + seq_len + n_forecast:
        return np.zeros((0, seq_len, 0), dtype=np.float32), np.array([], dtype=np.float32)

    if not isinstance(candles.index, pd.DatetimeIndex):
        candles = candles.copy()
        candles.index = pd.to_datetime(candles.index)
    candles = candles.sort_index()

    daily, close_aligned = _daily_features_from_candles(candles, llm_aggregates)
    n_daily = len(daily)
    if n_daily < seq_len + n_forecast:
        return np.zeros((0, seq_len, 0), dtype=np.float32), np.array([], dtype=np.float32)

    feature_cols = [c for c in daily.columns]
    n_features = len(feature_cols)
    F = daily[feature_cols].values.astype(np.float32)
    # Заполнить NaN (например от pct_change в начале) нулём
    np.nan_to_num(F, copy=False, nan=0.0, posinf=0.0, neginf=0.0)

    # close_aligned: индекс 0 соответствует candle index 20
    close_arr = close_aligned.values.astype(np.float64)
    n_samples = n_daily - seq_len - n_forecast + 1
    if n_samples <= 0:
        return np.zeros((0, seq_len, n_features), dtype=np.float32), np.array([], dtype=np.float32)

    X_seq = np.zeros((n_samples, seq_len, n_features), dtype=np.float32)
    y = np.zeros(n_samples, dtype=np.float32)
    for s in range(n_samples):
        X_seq[s] = F[s : s + seq_len]
        # Метка: forward return с первого дня после окна до +n_forecast
        start_close = close_arr[s + seq_len]
        end_close = close_arr[s + seq_len + n_forecast - 1]
        if start_close > 0:
            y[s] = (end_close / start_close) - 1.0
        else:
            y[s] = 0.0
    return X_seq, y
