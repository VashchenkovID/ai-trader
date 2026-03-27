import type { HorizonMomentumPoint, RecommendationCardItem } from './components/RecommendationCard'

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value
  return null
}

export function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function numberFromCandidates(root: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = asNumber(root[key])
    if (value != null) return value
  }
  return null
}

function toIsoDisplay(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('ru-RU')
}

function parseHorizonMomentumFromNn(nnPayload: Record<string, unknown>): HorizonMomentumPoint[] {
  const cols = nnPayload.featureColumns
  const vals = nnPayload.featureValues
  if (!Array.isArray(cols) || !Array.isArray(vals) || cols.length !== vals.length) return []
  const byCol: Record<string, number> = {}
  for (let i = 0; i < cols.length; i++) {
    const v = asNumber(vals[i])
    if (v != null) byCol[String(cols[i])] = v
  }
  const mapping: [string, HorizonMomentumPoint['id'], string][] = [
    ['ret1', '1d', '1 день'],
    ['ret5', '5d', '5 дней'],
    ['ret20', '20d', '~20 дней'],
  ]
  const out: HorizonMomentumPoint[] = []
  for (const [key, id, label] of mapping) {
    if (!(key in byCol)) continue
    const ret = byCol[key]
    out.push({
      id,
      label,
      returnPct: Math.round(ret * 100 * 10000) / 10000,
      kind: 'past_return',
    })
  }
  return out
}

function normalizeHorizonMomentum(
  payload: Record<string, unknown>,
  nnPayload: Record<string, unknown>,
): HorizonMomentumPoint[] {
  const raw = payload.horizonMomentum ?? payload.horizon_momentum
  if (Array.isArray(raw)) {
    const parsed: HorizonMomentumPoint[] = []
    for (const entry of raw) {
      const o = asRecord(entry)
      const id = asString(o.id)
      if (id !== '1d' && id !== '5d' && id !== '20d') continue
      const returnPct = asNumber(o.returnPct)
      if (returnPct == null) continue
      parsed.push({
        id,
        label: asString(o.label) ?? id,
        returnPct,
        kind: asString(o.kind) ?? 'past_return',
      })
    }
    if (parsed.length > 0) return parsed
  }
  return parseHorizonMomentumFromNn(nnPayload)
}

function normalizeFusionMode(payload: Record<string, unknown>): string {
  const explicit = asString(payload.fusionMode) ?? asString(payload.fusion_mode)
  if (explicit) return explicit
  const hasNn = asNumber(payload.nnScore) != null || asNumber(payload.nn_score) != null
  const llmPayload = asRecord(payload.llmJuryPayload ?? payload.llm_jury_payload)
  const hasLlm =
    asString(payload.llmReason) != null ||
    asString(payload.llm_reason) != null ||
    Object.keys(llmPayload).length > 0
  if (hasNn && hasLlm) return 'NN+LLM'
  if (hasNn) return 'NN'
  if (hasLlm) return 'LLM'
  return 'unknown'
}

export function normalizeRecommendation(payload: Record<string, unknown>): RecommendationCardItem {
  const llmPayload = asRecord(payload.llmJuryPayload ?? payload.llm_jury_payload)
  const nnPayload = asRecord(payload.nnPayload ?? payload.nn_payload)
  const recommendationRaw =
    asString(payload.recommendation) ??
    asString(payload.signal) ??
    asString(payload.action) ??
    'UNKNOWN'
  const recommendation = recommendationRaw.toUpperCase()
  const ticker =
    asString(payload.ticker) ?? asString(payload.symbol) ?? asString(payload.name) ?? '—'
  const figi = asString(payload.figi) ?? '—'
  const score = asNumber(payload.score) ?? asNumber(payload.nn_score) ?? asNumber(payload.nnScore)
  const confidence =
    asNumber(payload.confidence) ??
    asNumber(payload.nn_confidence) ??
    asNumber(payload.nnConfidence)
  const currentPrice = asNumber(payload.lastPrice) ?? asNumber(payload.currentPrice)
  const tradePlan = asRecord(payload.tradePlan ?? payload.trade_plan)
  const explain = asRecord(payload.explain)
  const entryPrice =
    asNumber(tradePlan.entryPrice) ?? numberFromCandidates(llmPayload, ['entryPrice', 'entry_price', 'entry'])
  const stopLoss =
    asNumber(tradePlan.stopLoss) ?? numberFromCandidates(llmPayload, ['stopLoss', 'stop_loss', 'sl'])
  const takeProfit = asNumber(tradePlan.takeProfit) ?? numberFromCandidates(llmPayload, [
    'takeProfit',
    'take_profit',
    'tp',
    'targetPrice',
    'target_price',
  ])
  const riskReward =
    asNumber(tradePlan.riskReward) ?? numberFromCandidates(llmPayload, ['riskReward', 'risk_reward', 'rr'])
  const recommendationLabel =
    recommendation === 'BUY'
      ? 'покупка'
      : recommendation === 'SELL'
        ? 'продажа'
        : recommendation === 'HOLD'
          ? 'удержание'
          : 'нейтрально'
  const explanation =
    asString(explain.summary) ??
    asString(payload.explanation) ??
    asString(llmPayload.explanation) ??
    asString(llmPayload.rationale) ??
    asString(llmPayload.llmReason) ??
    (asString(llmPayload.mode) === 'nn_only'
      ? 'Решение принято по сигналу нейросети без вызова LLM (уверенный NN-сигнал).'
      : null) ??
    `Сигнал: ${recommendationLabel}, confidence ${confidence != null ? `${Math.round(confidence * 100)}%` : 'не указана'}.`

  return {
    id:
      asString(payload.id) ??
      `${figi}-${asString(payload.analysisDate) ?? asString(payload.createdAt) ?? Math.random()}`,
    ticker,
    name: asString(payload.name),
    figi,
    recommendation:
      recommendation === 'BUY' || recommendation === 'SELL' || recommendation === 'HOLD'
        ? recommendation
        : 'UNKNOWN',
    score,
    confidence,
    currentPrice,
    entryPrice,
    stopLoss,
    takeProfit,
    riskReward,
    horizon: asString(tradePlan.horizon),
    invalidationCondition: asString(tradePlan.invalidationCondition),
    planStatus: asString(tradePlan.status),
    fusionMode: normalizeFusionMode(payload),
    analysisDate: toIsoDisplay(
      asString(payload.analysisDate) ??
        asString(payload.analysis_date) ??
        asString(payload.createdAt),
    ),
    reason:
      asString(payload.reason) ??
      asString(llmPayload.reason) ??
      asString(nnPayload.reason) ??
      asString(llmPayload.decision_reason),
    llmReason:
      asString(payload.llmReason) ??
      asString(payload.llm_reason) ??
      asString(llmPayload.llmReason) ??
      asString(llmPayload.llm_reason) ??
      asString(llmPayload.reason) ??
      asString(llmPayload.summary),
    skipReason:
      asString(payload.skipReason) ??
      asString(payload.skip_reason) ??
      asString(llmPayload.skipReason) ??
      asString(llmPayload.skip_reason),
    explanation,
    horizonMomentum: normalizeHorizonMomentum(payload, nnPayload),
    weeklyForecast: (() => {
      const w = payload.weeklyForecast ?? payload.weekly_forecast
      if (w && typeof w === 'object' && !Array.isArray(w)) {
        return w as Record<string, unknown>
      }
      return null
    })(),
    weeklyForecastAt:
      asString(payload.weeklyForecastAt as string | undefined) ??
      asString(payload.weekly_forecast_at as string | undefined) ??
      null,
    details: { ...payload, llmJuryPayload: llmPayload, nnPayload },
  }
}

export function safeRecommendationsPayload(raw: unknown): RecommendationCardItem[] {
  const root = asRecord(raw)
  const itemsValue = root.items ?? root.recommendations ?? root.data
  if (!Array.isArray(itemsValue)) return []
  return itemsValue.map(item => normalizeRecommendation(asRecord(item)))
}
