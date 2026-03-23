"""
Unit- и интеграционные тесты контуров обучения (Phase 4).

Тесты, зависящие от PyTorch/Lightning/pandas, помечены @pytest.mark.training и пропускаются,
если не установлена группа [training]. Интеграция с API не требует установки training.
"""

from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path

import pytest


# --- Pipeline (требует pandas/numpy) ---


@pytest.mark.training
def test_build_feature_pipeline_returns_non_empty_on_sufficient_data() -> None:
    pandas = pytest.importorskip("pandas")
    numpy = pytest.importorskip("numpy")
    from training.data.pipeline import build_feature_pipeline

    n = 100
    dates = pandas.date_range("2020-01-01", periods=n, freq="D")
    close = 100 + numpy.cumsum(numpy.random.randn(n).astype(numpy.float32) * 0.5)
    volume = numpy.ones(n, dtype=numpy.float32) * 1e6
    candles = pandas.DataFrame({"close": close, "volume": volume}, index=dates)
    X, y = build_feature_pipeline(candles, lookback_days=20, prediction_horizon=5)
    assert not X.empty
    assert len(y) == len(X)
    assert list(X.columns) == ["ret1", "ret5", "ret20", "vol_norm"]


@pytest.mark.training
def test_build_feature_pipeline_returns_empty_when_insufficient_data() -> None:
    pandas = pytest.importorskip("pandas")
    from training.data.pipeline import build_feature_pipeline

    candles = pandas.DataFrame({"close": [100.0, 101.0], "volume": [1e6, 1e6]})
    X, y = build_feature_pipeline(candles, lookback_days=20, prediction_horizon=5)
    assert X.empty
    assert y.empty


@pytest.mark.training
def test_build_feature_pipeline_with_llm_aggregates_adds_columns() -> None:
    pandas = pytest.importorskip("pandas")
    numpy = pytest.importorskip("numpy")
    from training.data.pipeline import build_feature_pipeline

    n = 100
    dates = pandas.date_range("2020-01-01", periods=n, freq="D")
    close = 100 + numpy.cumsum(numpy.random.randn(n).astype(numpy.float32) * 0.5)
    volume = numpy.ones(n, dtype=numpy.float32) * 1e6
    candles = pandas.DataFrame({"close": close, "volume": volume}, index=dates)
    agg_dates = pandas.date_range("2020-01-01", periods=80, freq="D")
    llm_agg = pandas.DataFrame(
        {"consensus": 0.6, "confidence_avg": 0.7, "dispersion": 0.1},
        index=agg_dates,
    )
    X, y = build_feature_pipeline(
        candles, lookback_days=20, prediction_horizon=5, llm_aggregates=llm_agg
    )
    assert not X.empty
    assert "llm_consensus" in X.columns
    assert "llm_confidence_avg" in X.columns
    assert "llm_dispersion" in X.columns
    assert X["llm_consensus"].iloc[0] == 0.6


@pytest.mark.training
def test_build_feature_pipeline_with_options_adds_option_columns() -> None:
    pandas = pytest.importorskip("pandas")
    numpy = pytest.importorskip("numpy")
    from training.data.pipeline import build_feature_pipeline

    n = 120
    dates = pandas.date_range("2020-01-01", periods=n, freq="D")
    close = 100 + numpy.cumsum(numpy.random.randn(n).astype(numpy.float32) * 0.5)
    volume = numpy.ones(n, dtype=numpy.float32) * 1e6
    candles = pandas.DataFrame({"close": close, "volume": volume}, index=dates)
    options = pandas.DataFrame(
        {
            "date": pandas.date_range("2020-03-01", periods=4, freq="D"),
            "opt_contracts_total": [200, 210, 220, 230],
            "opt_call_share": [0.5, 0.6, 0.55, 0.52],
            "opt_put_share": [0.5, 0.4, 0.45, 0.48],
            "opt_days_to_expiry_mean": [30, 29, 28, 27],
            "opt_days_to_expiry_min": [5, 5, 4, 4],
            "opt_strike_mean": [100, 101, 102, 103],
            "opt_strike_std": [10, 10, 9, 9],
        }
    ).set_index("date")
    X, y = build_feature_pipeline(
        candles, options=options, lookback_days=20, prediction_horizon=5
    )
    assert not X.empty
    assert len(y) == len(X)
    assert "opt_contracts_total" in X.columns
    assert "opt_days_to_expiry_mean" in X.columns
    assert "opt_strike_std" in X.columns


@pytest.mark.training
def test_build_feature_pipeline_with_signals_adds_signal_columns() -> None:
    pandas = pytest.importorskip("pandas")
    numpy = pytest.importorskip("numpy")
    from training.data.pipeline import build_feature_pipeline

    n = 120
    dates = pandas.date_range("2020-01-01", periods=n, freq="D")
    close = 100 + numpy.cumsum(numpy.random.randn(n).astype(numpy.float32) * 0.5)
    volume = numpy.ones(n, dtype=numpy.float32) * 1e6
    candles = pandas.DataFrame({"close": close, "volume": volume}, index=dates)
    signals = pandas.DataFrame(
        {
            "date": pandas.date_range("2020-03-01", periods=4, freq="D"),
            "sig_count": [4, 6, 5, 7],
            "sig_buy_share": [0.5, 0.66, 0.6, 0.57],
            "sig_sell_share": [0.5, 0.34, 0.4, 0.43],
            "sig_avg_probability": [0.55, 0.58, 0.61, 0.63],
            "sig_avg_horizon_days": [5, 6, 4, 7],
        }
    ).set_index("date")
    X, y = build_feature_pipeline(
        candles, signals=signals, lookback_days=20, prediction_horizon=5
    )
    assert not X.empty
    assert len(y) == len(X)
    assert "sig_count" in X.columns
    assert "sig_avg_probability" in X.columns


@pytest.mark.training
def test_time_based_split_ratios() -> None:
    pandas = pytest.importorskip("pandas")
    from training.data.pipeline import time_based_split

    n = 100
    X = pandas.DataFrame({"a": range(n)}, index=pandas.date_range("2020-01-01", periods=n, freq="D"))
    y = pandas.Series(range(n), index=X.index)
    Xt, yt, Xv, yv, Xte, yte = time_based_split(X, y, train_ratio=0.7, val_ratio=0.15)
    assert len(Xt) == 70
    assert len(Xv) == 15
    assert len(Xte) == 15
    assert len(yt) == 70 and len(yv) == 15 and len(yte) == 15


@pytest.mark.training
def test_build_weekly_sequences_shapes_and_no_lookahead() -> None:
    pandas = pytest.importorskip("pandas")
    numpy = pytest.importorskip("numpy")
    from training.data.pipeline import build_weekly_sequences

    seq_len, n_forecast = 30, 5
    n_days = 100
    dates = pandas.date_range("2020-01-01", periods=n_days, freq="D")
    close = 100 + numpy.cumsum(numpy.random.randn(n_days).astype(numpy.float32) * 0.5)
    volume = numpy.ones(n_days, dtype=numpy.float32) * 1e6
    candles = pandas.DataFrame({"close": close, "volume": volume}, index=dates)
    X_seq, y = build_weekly_sequences(candles, seq_len=seq_len, n_forecast=n_forecast)
    assert X_seq.ndim == 3
    assert X_seq.shape[1] == seq_len
    assert X_seq.shape[2] == 4
    assert len(y) == X_seq.shape[0]
    assert y.ndim == 1
    n_expected = n_days - 20 - seq_len - n_forecast + 1
    assert X_seq.shape[0] == n_expected


@pytest.mark.training
def test_build_weekly_sequences_with_options_increases_feature_count() -> None:
    pandas = pytest.importorskip("pandas")
    numpy = pytest.importorskip("numpy")
    from training.data.pipeline import build_weekly_sequences

    seq_len, n_forecast = 30, 5
    n_days = 120
    dates = pandas.date_range("2020-01-01", periods=n_days, freq="D")
    close = 100 + numpy.cumsum(numpy.random.randn(n_days).astype(numpy.float32) * 0.5)
    volume = numpy.ones(n_days, dtype=numpy.float32) * 1e6
    candles = pandas.DataFrame({"close": close, "volume": volume}, index=dates)
    options = pandas.DataFrame(
        {
            "date": pandas.date_range("2020-03-01", periods=3, freq="D"),
            "opt_contracts_total": [200, 210, 220],
            "opt_call_share": [0.5, 0.6, 0.55],
            "opt_put_share": [0.5, 0.4, 0.45],
            "opt_days_to_expiry_mean": [30, 29, 28],
            "opt_days_to_expiry_min": [5, 5, 4],
            "opt_strike_mean": [100, 101, 102],
            "opt_strike_std": [10, 10, 9],
        }
    ).set_index("date")
    X_seq, y = build_weekly_sequences(
        candles, options=options, seq_len=seq_len, n_forecast=n_forecast
    )
    assert X_seq.ndim == 3
    assert len(y) == X_seq.shape[0]
    assert X_seq.shape[2] > 4


@pytest.mark.training
def test_build_weekly_sequences_returns_empty_when_insufficient_data() -> None:
    pandas = pytest.importorskip("pandas")
    from training.data.pipeline import build_weekly_sequences

    candles = pandas.DataFrame({"close": [100.0] * 30, "volume": [1e6] * 30})
    X_seq, y = build_weekly_sequences(candles, seq_len=30, n_forecast=5)
    assert X_seq.shape[0] == 0
    assert len(y) == 0


# --- NN forward (требует torch) ---


@pytest.mark.training
def test_cond_mlp_forward_shape() -> None:
    torch = pytest.importorskip("torch")
    from training.models.nn import CondMLP

    model = CondMLP(input_size=4, hidden_sizes=(8, 4), embed_dim=4)
    batch = 3
    x = torch.randn(batch, 4)
    s = torch.randint(0, 3, (batch,))
    h = torch.randint(0, 3, (batch,))
    score, confidence = model(x, s, h)
    assert score.shape == (batch,)
    assert confidence.shape == (batch,)
    assert (score >= 0).all() and (score <= 1).all()
    assert (confidence >= 0).all() and (confidence <= 1).all()


# --- Inference load (требует torch, создаём фейковый чекпоинт) ---


@pytest.mark.training
def test_load_cond_mlp_and_predict_from_fake_checkpoint(tmp_path: Path) -> None:
    torch = pytest.importorskip("torch")
    from training.models.nn import CondMLP
    from training.inference_nn import load_cond_mlp, load_model_and_predict

    model = CondMLP(input_size=4, hidden_sizes=(8, 4), embed_dim=4)
    state = {k.removeprefix("model."): v for k, v in model.state_dict().items()}
    ckpt = {
        "state_dict": {"model." + k: v for k, v in model.state_dict().items()},
        "hyper_parameters": {"input_size": 4, "hidden_sizes": (8, 4), "embed_dim": 4, "dropout": 0.1},
    }
    ckpt_path = tmp_path / "test.ckpt"
    torch.save(ckpt, ckpt_path)
    loaded = load_cond_mlp(ckpt_path)
    assert loaded.input_size == 4
    x = torch.randn(2, 4)
    score, conf = load_model_and_predict(ckpt_path, x, strategy_id=1, horizon_id=2)
    assert score.shape == (2,)
    assert conf.shape == (2,)


@pytest.mark.training
def test_load_ensemble_and_predict_from_fake_checkpoint(tmp_path: Path) -> None:
    torch = pytest.importorskip("torch")
    from training.models.nn import CondMLP
    from training.inference_nn import load_ensemble_and_predict

    model = CondMLP(input_size=4, hidden_sizes=(8, 4), embed_dim=4)
    ckpt = {
        "state_dict": {"model." + k: v for k, v in model.state_dict().items()},
        "hyper_parameters": {"input_size": 4, "hidden_sizes": (8, 4), "embed_dim": 4, "dropout": 0.1},
    }
    ckpt_path = tmp_path / "test.ckpt"
    torch.save(ckpt, ckpt_path)
    x = torch.randn(2, 4)
    score, conf = load_ensemble_and_predict(ckpt_path, x)
    assert score.shape == (2,)
    assert conf.shape == (2,)
    assert (score >= 0).all() and (score <= 1).all()


@pytest.mark.training
def test_get_meta_weights_returns_tensors() -> None:
    torch = pytest.importorskip("torch")
    from training.models.meta import get_meta_weights

    hw, sw = get_meta_weights()
    assert hw.shape == (3,)
    assert sw.shape == (3,)
    assert torch.allclose(hw.sum(), torch.tensor(1.0))
    assert torch.allclose(sw.sum(), torch.tensor(1.0))
    hw2, sw2 = get_meta_weights(llm_consensus=0.3)
    assert hw2.shape == (3,)
    assert sw2.shape == (3,)


@pytest.mark.training
def test_load_ensemble_weights_from_json(tmp_path: Path) -> None:
    import json
    from training.inference_nn import load_ensemble_weights

    path = tmp_path / "weights.json"
    path.write_text(json.dumps({"horizon_weights": [0.2, 0.3, 0.5], "strategy_weights": [0.33, 0.33, 0.34]}))
    out = load_ensemble_weights(path)
    assert out is not None
    hw, sw = out
    assert hw.shape == (3,)
    assert sw.shape == (3,)
    assert abs(hw[0].item() - 0.2) < 1e-5
    invalid = tmp_path / "bad.json"
    invalid.write_text("{}")
    assert load_ensemble_weights(invalid) is None


@pytest.mark.training
def test_run_weekly_returns_mlflow_run_id() -> None:
    pytest.importorskip("torch")
    pytest.importorskip("pytorch_lightning")
    from training.run_weekly import run

    run_id = run(max_epochs=1, batch_size=8)
    assert run_id is not None
    assert isinstance(run_id, str)
    assert len(run_id) > 0


# --- LLM jury (без torch) ---


def test_build_jury_prompt_substitutes_ticker_and_context() -> None:
    from training.llm_jury.prompts import build_jury_prompt

    out = build_jury_prompt(ticker="SBER", context="Нефть растёт, сектор банки.")
    assert "SBER" in out
    assert "Нефть растёт" in out
    assert "финансовый аналитик" in out
    assert "ACTION: BUY|SELL|HOLD" in out
    assert "CONFIDENCE: 0.00-1.00" in out
    assert "только на русском языке" in out
    assert "максимум 120 слов" in out


@pytest.mark.asyncio
async def test_run_jury_returns_list_of_opinions() -> None:
    from training.llm_jury.run import run_jury
    from training.llm_jury.providers.mock import MockLLMProvider

    providers = [MockLLMProvider("mock1"), MockLLMProvider("mock2")]
    opinions = await run_jury("TEST", "Context here", providers)
    assert len(opinions) == 2
    for o in opinions:
        assert o.action in ("BUY", "SELL", "HOLD")
        assert 0 <= o.confidence <= 1
        assert o.model_id in ("mock1", "mock2")


def test_aggregate_opinions() -> None:
    from training.llm_jury.run import aggregate_opinions
    from training.llm_jury.providers.base import JuryOpinion

    opinions = [
        JuryOpinion("a", "BUY", 0.8),
        JuryOpinion("b", "HOLD", 0.5),
        JuryOpinion("c", "SELL", 0.3),
    ]
    consensus, dispersion = aggregate_opinions(opinions)
    assert 0 <= consensus <= 1
    assert dispersion >= 0


def test_aggregate_opinions_empty_returns_neutral() -> None:
    from training.llm_jury.run import aggregate_opinions

    consensus, dispersion = aggregate_opinions([])
    assert consensus == 0.5
    assert dispersion == 0.0


def test_parse_verdict_extracts_buy_sell_hold() -> None:
    from training.llm_jury.parse_verdict import parse_verdict

    action, conf = parse_verdict("ПРАКТИЧЕСКИЙ ВЕРДИКТ: BUY. Confidence: 0.8")
    assert action == "BUY"
    assert conf == 0.8
    action2, _ = parse_verdict("Recommendation: SELL.")
    assert action2 == "SELL"
    action3, c3 = parse_verdict("Nothing here")
    assert action3 == "HOLD"
    assert c3 == 0.5


def test_parse_verdict_extracts_compact_prompt_format() -> None:
    from training.llm_jury.parse_verdict import parse_verdict

    action, conf = parse_verdict(
        "ACTION: SELL\nCONFIDENCE: 0.42\nHORIZON: short\nREASONS:\n- risk"
    )
    assert action == "SELL"
    assert conf == 0.42


@pytest.mark.asyncio
async def test_perplexity_provider_no_key_returns_hold() -> None:
    from training.llm_jury.providers.perplexity import PerplexityProvider

    provider = PerplexityProvider(api_key="")
    opinion = await provider.get_opinion("Test prompt")
    assert opinion.model_id == "perplexity"
    assert opinion.action == "HOLD"
    assert opinion.confidence == 0.5


@pytest.mark.asyncio
async def test_gigachat_provider_no_creds_returns_hold() -> None:
    from training.llm_jury.providers.gigachat import GigaChatProvider

    provider = GigaChatProvider(client_id="", client_secret="")
    opinion = await provider.get_opinion("Test prompt")
    assert opinion.model_id == "giga_chat"
    assert opinion.action == "HOLD"
    assert opinion.confidence == 0.5


@pytest.mark.asyncio
async def test_deepseek_provider_no_key_returns_hold() -> None:
    from training.llm_jury.providers.deepseek import DeepSeekProvider

    provider = DeepSeekProvider(api_key="")
    opinion = await provider.get_opinion("Test prompt")
    assert opinion.model_id == "deepseek"
    assert opinion.action == "HOLD"
    assert opinion.confidence == 0.5


@pytest.mark.asyncio
async def test_alisa_gpt_provider_no_creds_returns_hold() -> None:
    from training.llm_jury.providers.alisa_gpt import AlisaGptProvider

    provider = AlisaGptProvider(api_key="", folder_id="")
    opinion = await provider.get_opinion("Test prompt")
    assert opinion.model_id == "alisa_gpt"
    assert opinion.action == "HOLD"
    assert opinion.confidence == 0.5


# --- Data loaders (реальные данные) ---


def test_load_candles_from_csv(tmp_path: Path) -> None:
    import pandas as pd
    from training.data.loaders import load_candles_from_csv

    csv_path = tmp_path / "candles.csv"
    dates = pd.date_range("2020-01-01", periods=10, freq="D")
    df = pd.DataFrame({"candle_time": dates, "close": [100.0 + i for i in range(10)], "volume": [1e6] * 10})
    df.to_csv(csv_path, index=False)
    loaded = load_candles_from_csv(csv_path)
    assert not loaded.empty
    assert "close" in loaded.columns
    assert len(loaded) == 10


def test_candles_to_dataframe_from_dicts() -> None:
    from training.data.loaders import candles_to_dataframe

    rows = [
        {"candle_time": "2020-01-01", "close": 100.0, "volume": 1000},
        {"candle_time": "2020-01-02", "close": 101.0, "volume": 1100},
    ]
    df = candles_to_dataframe(rows)
    assert not df.empty
    assert "close" in df.columns and "volume" in df.columns
    assert len(df) == 2


# --- API integration (без зависимости training в тесте) ---


@pytest.mark.asyncio
async def test_training_run_nn_background_returns_200_and_status(client) -> None:
    response = await client.post("/api/v1/training/run-nn-background", params={"epochs": 2})
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] in ("scheduled", "rejected")
    assert "message" in data


@pytest.mark.asyncio
async def test_training_run_jury_returns_200_with_results(client) -> None:
    response = await client.post("/api/v1/training/run-jury", json={"figi": "BBG004730N88"})
    assert response.status_code == 200
    data = response.json()
    assert "status" in data and "results" in data
    assert len(data["results"]) >= 1
    assert data["results"][0].get("status") in ("ok", "error")


@pytest.mark.asyncio
async def test_training_run_weekly_returns_200_with_mlflow_run_id(client) -> None:
    response = await client.post(
        "/api/v1/training/run-weekly",
        params={"epochs": 1, "seq_len": 30, "n_forecast": 5},
    )
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert data["status"] in ("completed", "unavailable")
    if data["status"] == "completed":
        assert "mlflow_run_id" in data
        assert isinstance(data["mlflow_run_id"], str)


@pytest.mark.training
def test_run_backtest_on_progress_called_on_missing_checkpoint() -> None:
    """Синхронный run_backtest вызывает on_progress (для проброса в WS из scheduler)."""
    pytest.importorskip("torch")
    from training.run_backtest import run

    messages: list[dict[str, object]] = []

    def on_progress(payload: dict[str, object]) -> None:
        messages.append(payload)

    run("/nonexistent/missing.ckpt", on_progress=on_progress)
    assert messages
    assert any("message" in m for m in messages)


@pytest.mark.training
def test_run_backtest_forwards_options_and_signals_to_pipeline(monkeypatch: pytest.MonkeyPatch) -> None:
    """run_backtest передаёт options/signals в build_feature_pipeline (согласованность с run_nn)."""
    pandas = pytest.importorskip("pandas")
    from training import run_backtest

    captured: dict[str, object] = {}

    def fake_build(
        candles,
        *,
        options=None,
        signals=None,
        lookback_days: int = 60,
        prediction_horizon: int = 5,
        **kwargs: object,
    ):
        captured["options"] = options
        captured["signals"] = signals
        return pandas.DataFrame(), pandas.Series(dtype=float)

    monkeypatch.setattr(run_backtest, "build_feature_pipeline", fake_build)

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".ckpt")
    tmp.write(b"x")
    tmp.close()
    try:
        idx = pandas.date_range("2020-01-01", periods=200, freq="D")
        candles = pandas.DataFrame({"close": [100.0] * 200, "volume": [1e6] * 200}, index=idx)
        opt = pandas.DataFrame({"opt_contracts_total": [1.0]}, index=pandas.date_range("2020-01-01", periods=1))
        sig = pandas.DataFrame({"sig_count": [2.0]}, index=pandas.date_range("2020-01-01", periods=1))
        run_backtest.run(
            tmp.name,
            candles_df=candles,
            options=opt,
            signals=sig,
            log_mlflow=False,
        )
    finally:
        os.unlink(tmp.name)

    assert captured.get("options") is opt
    assert captured.get("signals") is sig
