# PARITY GAP MATRIX (Node -> FastAPI)

## Background Jobs

- `cache_update` / `cache_full_update` / `market_refresh`: implemented in FastAPI, simplified logic.
- `tinkoff_portfolio_sync` / `tinkoff_instruments` / `tinkoff_last_prices`: implemented.
- `fundamental_sync_and_fill` / `trading_windows_update` / `weekly_update`: previously stubbed, scheduled for full logic.
- `portfolio_prices_update` / `active_signals_prices_update` / `trading_requests_prices_update`: missing in FastAPI, targeted for parity.
- `weekly_backtest` / `dynamic_budget_rebalance` / `portfolio_rebalancing`: missing in FastAPI, targeted for parity.
- `partial_exit_check` / `trailing_stops_check` / `position_monitoring`: missing in FastAPI, targeted for parity.

## Tinkoff API Surface

- Implemented in FastAPI: last prices, candles, shares, instrument by FIGI, portfolio, positions, place order, assets, options, analyst signals.
- Missing/partial vs Node: accounts, user info, operations, order state/history/cancel, active orders, trades, trading schedules/status, currencies/bonds/etfs, dividends, find instrument, options-by, asset fundamentals.

## WebSocket / Status

- Implemented: `/api/v1/ws/system-status` with snapshot/heartbeat and scheduler/task events.
- Gap: richer domain telemetry parity with Node events and resource/worker details.

## Telegram

- Node: full Telegram runtime (bot lifecycle, routes, alerts, test connection, settings).
- FastAPI: absent before parity phase, targeted to implement minimal parity subsystem.

## Training

- Implemented: NN/Weekly/RL/Backtest/Stacking endpoints and LLM-jury endpoint.
- Gap: full vs quick orchestration semantics, explicit resume/continual learning path, richer training progress events.

## LLM Providers

- Implemented providers: DeepSeek, Perplexity, GigaChat, Alisa GPT, Mock.
- Persistence implemented: `llm_jury_opinions`, `llm_jury_aggregates`.
- Gap: live provider integration tests (opt-in by marker/env) in addition to mocked/fallback tests.
