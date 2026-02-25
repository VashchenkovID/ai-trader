# AI Trader - Recommended Improvements Backlog

This file collects all recommended features and improvements discussed in chat.
Focus: long-term robustness, measurable edge, and safe real trading.

## Priority Legend
- P0: Critical safety / correctness
- P1: High impact on performance and stability
- P2: Medium impact / scale-up
- P3: Nice-to-have / optimization

---

## P0 - Safety and Correctness

- [ ] Keep strict rule for `real`/`micro`: no auto execution without explicit user confirmation.
- [ ] Add pre-confirmation validation in `real` mode (fresh price, spread, liquidity, stale signal check).
- [ ] Add execution tolerance policy for real orders:
  - max slippage
  - max spread
  - max allowed quote staleness
- [ ] Add hard circuit breakers:
  - daily loss limit
  - max drawdown limit
  - consecutive losses limit
  - auto pause real mode until manual re-enable
- [ ] Ensure all gate failures are fail-safe (block trade by default when metrics unavailable).

---

## P1 - Model and Decision Quality

- [ ] Improve confidence calibration:
  - map raw model confidence to expected return after costs
  - include reliability metrics (Brier/calibration checks)
- [ ] Evolve meta-policy from static rules to adaptive policy learning:
  - regime-aware threshold tuning by rolling OOS results
- [ ] Add formal release gate policy for models:
  - enforce min trades, win rate, profit factor, sharpe/sortino, consistency, max DD
  - block model promotion when any criterion fails
- [ ] Add robust drift response:
  - detect degradation quickly
  - rollback to last stable model
  - optionally switch to signal-only mode

---

## P1 - Backtesting and Paper Realism

- [ ] Keep anti-lookahead protections and add more regression tests.
- [ ] Increase execution realism in paper/backtest:
  - dynamic spread/slippage by liquidity regime
  - partial fill behavior
  - reject/timeout simulation
- [ ] Add scenario tests for stress periods (high volatility, gaps, low liquidity).
- [ ] Add baseline comparisons everywhere:
  - buy & hold
  - simple momentum
  - AI excess return vs baseline

---

## P1 - Observability and Diagnostics

- [ ] Keep structured error context for each operation:
  - traceId, operation, step, figi, requestId, mode
- [ ] Extend admission telemetry:
  - gate pass/block counts
  - blocked by gate type
  - recent trace snapshots
- [ ] Add dedicated API for diagnostics:
  - `/auto-paper/admission-quality`
  - filters by gate/figi/traceId/time window
- [ ] Add dashboard widgets:
  - decision quality
  - admission gates
  - error tracking heatmap by operation

---

## P2 - Real Trading Execution Enhancements

- [ ] Implement two-step confirmation UX in real mode:
  - AI recommendation
  - final user approval after pre-trade checks
- [ ] Add smart confirmation payload:
  - expected edge
  - risk/reward
  - projected worst-case
  - reason flags when near risk limits
- [ ] Add post-trade attribution:
  - what generated PnL (model/regime/entry/exit/size/costs)
- [ ] Add execution quality analytics:
  - expected vs actual fill
  - slippage breakdown
  - rejected opportunities statistics

---

## P2 - Testing Roadmap

- [ ] Add unit tests for admission and release gates:
  - pass/fail boundary tests
  - fail-safe behavior when metrics source unavailable
- [ ] Add unit tests for meta-policy adaptation:
  - regime mapping and threshold adjustment boundaries
- [ ] Add integration tests:
  - end-to-end signal -> gate -> request -> execution flow
  - real-mode confirmation-only path
- [ ] Add regression tests for:
  - anti-lookahead logic
  - error tracking payload shape
  - daily report summaries with gate snapshots

---

## P3 - Governance and Long-Horizon Reliability

- [ ] Introduce stronger model governance:
  - versioned datasets
  - reproducible experiments
  - model registry with promotion history
- [ ] Add release audit trail:
  - who/what promoted model
  - metric evidence snapshot
  - rollback reason if reverted
- [ ] Add shadow-mode validation for new policies before activation.
- [ ] Add periodic retraining and review calendar with automated reports.

---

## Suggested Implementation Order (Pragmatic)

1. P0 safety hardening for real mode and execution tolerance.
2. P1 calibration + release gate hardening + drift rollback.
3. P1/P2 observability APIs and dashboards.
4. P2 integration tests and scenario testing.
5. P3 governance for long-term scaling.

---

## Notes for Decision-Making

- More ML complexity alone does not guarantee better returns.
- Biggest gains usually come from:
  - strict OOS discipline
  - realistic execution assumptions
  - robust risk controls
  - fast failure diagnostics

