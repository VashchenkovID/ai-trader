/**
 * Подписи к полям рекомендации / trade plan / LLM / NN для UI (camelCase и snake_case).
 */
const KEY_LABELS: Record<string, string> = {
  summary: 'Сводка',
  modelDecision: 'Код режима модели',
  marketRegime: 'Рыночный режим',
  whyNoLlm: 'Почему без LLM',
  dataFreshnessSec: 'Свежесть данных, сек',
  status: 'Статус',
  statusReason: 'Причина статуса',
  entryPrice: 'Цена входа',
  stopLoss: 'Стоп-лосс',
  takeProfit: 'Тейк-профит',
  riskReward: 'Риск / доходность',
  horizon: 'Горизонт',
  positionRiskPct: 'Риск на позицию, %',
  invalidationCondition: 'Условие инвалидации',
  mode: 'Режим',
  llmReason: 'Причина (LLM)',
  marketRegimeLlm: 'Режим рынка (LLM)',
  entry_price: 'Цена входа',
  stop_loss: 'Стоп-лосс',
  take_profit: 'Тейк-профит',
  risk_reward: 'Риск / доходность',
  ok: 'Успех',
  reason: 'Причина',
  detail: 'Деталь',
  hint: 'Подсказка',
  source: 'Источник',
  recommendationId: 'ID рекомендации',
  weeklyForecastAt: 'Прогноз обновлён',
  totalCandles: 'Число свечей',
  featureColumns: 'Признаки (столбцы)',
  featureValues: 'Значения признаков',
  feature_columns: 'Признаки (столбцы)',
  feature_values: 'Значения признаков',
  nnScoreRaw: 'NN score (сырой)',
  finalScore: 'Итоговый score',
  fusionWeights: 'Веса fusion',
  providers: 'Провайдеры',
  opinions: 'Мнения',
  aggregate: 'Агрегат',
  consensus: 'Консенсус',
  dispersion: 'Разброс',
}

function labelForKey(key: string): string {
  return KEY_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim()
}

function formatPrimitive(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? 'да' : 'нет'
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0)) return v.toExponential(4)
    return String(v)
  }
  if (typeof v === 'string') return v.trim() || '—'
  return String(v)
}

/**
 * Плоский список «параметр → значение» для объектов глубины до maxDepth (вложенные объекты — JSON).
 */
export function objectToLabeledStrings(
  obj: unknown,
  maxDepth = 2,
  prefix = '',
  depth = 0,
): { label: string; value: string }[] {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
    return []
  }
  const rows: { label: string; value: string }[] = []
  const o = obj as Record<string, unknown>
  for (const [k, v] of Object.entries(o)) {
    const path = prefix ? `${prefix}.${k}` : k
    const label = labelForKey(k)
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      if (depth < maxDepth) {
        rows.push(...objectToLabeledStrings(v, maxDepth, path, depth + 1))
      } else {
        rows.push({ label, value: JSON.stringify(v, null, 2) })
      }
      continue
    }
    if (Array.isArray(v)) {
      if (v.length === 0) {
        rows.push({ label, value: '—' })
      } else if (v.every(x => x == null || typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean')) {
        rows.push({ label, value: v.map(formatPrimitive).join(', ') })
      } else {
        rows.push({ label, value: JSON.stringify(v, null, 2) })
      }
      continue
    }
    rows.push({ label, value: formatPrimitive(v) })
  }
  return rows
}

const STATUS_HUMAN: Record<string, string> = {
  ready: 'Готово',
  insufficient_data: 'Недостаточно данных',
  last_price_unavailable: 'Нет цены инструмента',
  unknown: 'Неизвестно',
}

const MODEL_DECISION_HUMAN: Record<string, string> = {
  nn_only: 'Только нейросеть',
  nn_llm: 'NN + LLM',
  llm_only: 'Только LLM',
  unknown: 'Не определено',
}

export type ExplainParts = {
  summaryText: string
  detailRows: { label: string; value: string }[]
}

/** API отдаёт explain как объект с summary или (редко) строку. */
export function parseExplain(explain: unknown): ExplainParts | null {
  if (explain == null) return null
  if (typeof explain === 'string') {
    const t = explain.trim()
    return t ? { summaryText: t, detailRows: [] } : null
  }
  if (typeof explain !== 'object' || Array.isArray(explain)) return null
  const o = explain as Record<string, unknown>
  const summaryRaw = o.summary
  const summaryText =
    typeof summaryRaw === 'string' && summaryRaw.trim()
      ? summaryRaw.trim()
      : typeof summaryRaw === 'object' && summaryRaw != null
        ? JSON.stringify(summaryRaw, null, 2)
        : ''

  const detailRows: { label: string; value: string }[] = []

  const md = o.modelDecision
  if (md != null && String(md)) {
    const code = String(md)
    detailRows.push({
      label: 'Режим решения',
      value: MODEL_DECISION_HUMAN[code] ?? code,
    })
  }
  if (o.marketRegime != null && String(o.marketRegime)) {
    detailRows.push({ label: 'Рыночный режим', value: String(o.marketRegime) })
  }
  if (o.whyNoLlm != null && String(o.whyNoLlm).trim()) {
    detailRows.push({ label: 'Комментарий по LLM', value: String(o.whyNoLlm) })
  }
  if (o.dataFreshnessSec != null && o.dataFreshnessSec !== '') {
    detailRows.push({ label: 'Свежесть данных, сек', value: formatPrimitive(o.dataFreshnessSec) })
  }

  if (!summaryText && detailRows.length === 0) {
    const flat = objectToLabeledStrings(o, 2)
    if (flat.length === 0) return null
    return { summaryText: '', detailRows: flat }
  }
  return { summaryText, detailRows }
}

export function humanizeTradeStatus(status: unknown, reason: unknown): string {
  const s = status != null ? String(status) : ''
  const r = reason != null ? String(reason) : ''
  const sh = STATUS_HUMAN[s] ?? s
  const rh = STATUS_HUMAN[r] ?? r
  if (r && r !== 'null' && r !== 'undefined') return `${sh} (${rh})`
  return sh || '—'
}

const LLM_REASON_HUMAN: Record<string, string> = {
  ok: 'Жюри учтено в итоге',
  skipped_confident_nn: 'Жюри не влияло: NN была уверена',
  cache_hit: 'Взято из кэша',
  daily_limit: 'Сегодня уже есть ответ жюри',
  unavailable: 'Ответ жюри неполный',
  providers_missing: 'Нет данных жюри',
  exception: 'Ошибка при запросе жюри',
}

const FUSION_MODE_HUMAN: Record<string, string> = {
  nn_llm: 'Нейросеть + жюри LLM',
  nn_only: 'Только нейросеть',
  llm_only: 'Только жюри LLM',
  degrade_to_hold: 'Нейтрально (мало сигналов)',
  none: '—',
}

const ACTION_RU: Record<string, string> = {
  BUY: 'покупка',
  SELL: 'продажа',
  HOLD: 'ждать',
}

export type LlmJuryCardSummary = {
  title: string
  lines: string[]
  providers: { name: string; text: string }[]
}

/** Человекочитаемое резюме гибридного payload (scheduler_analysis_hybrid) без сырого JSON. */
export function summarizeLlmJuryForUser(payload: unknown): LlmJuryCardSummary | null {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) return null
  const p = payload as Record<string, unknown>
  const mode = String(p.mode ?? '')
  const title = FUSION_MODE_HUMAN[mode] ?? 'Сигнал моделей'
  const lines: string[] = []

  const fs = p.finalScore
  const fc = p.finalConfidence
  const bits: string[] = []
  if (typeof fs === 'number' && Number.isFinite(fs)) {
    bits.push(`ориентир ${fs.toFixed(2)} (0 — к снижению, 1 — к росту)`)
  }
  if (typeof fc === 'number' && Number.isFinite(fc)) {
    bits.push(`уверенность ${Math.round(fc * 100)}%`)
  }
  if (bits.length) {
    lines.push(bits.join('; '))
  }

  const lr = p.llmReason != null ? String(p.llmReason) : ''
  if (lr) {
    lines.push(LLM_REASON_HUMAN[lr] ?? lr)
  }

  const providers: { name: string; text: string }[] = []
  const llmBlock = p.llm
  if (llmBlock != null && typeof llmBlock === 'object' && !Array.isArray(llmBlock)) {
    const L = llmBlock as Record<string, unknown>
    const prov = L.providers
    if (prov != null && typeof prov === 'object' && !Array.isArray(prov)) {
      const labelByKey: Record<string, string> = {
        gigachat: 'GigaChat',
        alisa_gpt: 'Алиса (YandexGPT)',
      }
      for (const [key, raw] of Object.entries(prov as Record<string, unknown>)) {
        if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) continue
        const row = raw as Record<string, unknown>
        const act = String(row.action ?? '').toUpperCase()
        const cf =
          typeof row.confidence === 'number' && Number.isFinite(row.confidence)
            ? Math.round(row.confidence * 100)
            : null
        const ru = ACTION_RU[act] || act || '—'
        const name = labelByKey[key] ?? key
        providers.push({
          name,
          text: cf != null ? `склоняется к ${ru} (${cf}% уверенности)` : `склоняется к ${ru}`,
        })
      }
    }
    if (providers.length === 0) {
      const cons = L.consensus
      const confAvg = L.confidenceAvg
      if (typeof cons === 'number' && Number.isFinite(cons)) {
        lines.push(`Согласованность жюри: ${cons.toFixed(2)}`)
      }
      if (typeof confAvg === 'number' && Number.isFinite(confAvg)) {
        lines.push(`Средняя уверенность моделей: ${Math.round(confAvg * 100)}%`)
      }
    }
  }

  if (lines.length === 0 && providers.length === 0) return null
  return { title, lines, providers }
}

const NN_REASON_HUMAN: Record<string, string> = {
  unavailable: 'Нейросеть недоступна',
  insufficient_data: 'Недостаточно данных для оценки NN',
}

/** Одна–две фразы о nnPayload без таблиц признаков и JSON. */
export function summarizeNnPayloadForUser(payload: unknown): string[] {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) return []
  const p = payload as Record<string, unknown>
  if (p.ok === false) {
    const r = p.reason != null ? String(p.reason) : ''
    return [NN_REASON_HUMAN[r] ?? (r ? `Оценка NN: ${r}` : 'Оценка NN недоступна')]
  }
  const out: string[] = []
  const n = p.featureCount ?? p.feature_count
  if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
    out.push(`В расчёте использовано признаков: ${Math.round(n)}`)
  }
  const regime = p.marketRegime ?? p.market_regime
  if (regime != null && String(regime) && String(regime) !== 'unknown') {
    out.push(`Режим в признаках: ${String(regime)}`)
  }
  return out
}

export function tradePlanToRows(plan: unknown): { label: string; value: string }[] {
  if (plan == null || typeof plan !== 'object' || Array.isArray(plan)) return []
  const p = plan as Record<string, unknown>
  const rows: { label: string; value: string }[] = []
  if (p.status != null || p.statusReason != null) {
    rows.push({
      label: 'Статус плана',
      value: humanizeTradeStatus(p.status, p.statusReason),
    })
  }
  const skip = new Set(['status', 'statusReason'])
  for (const [k, v] of Object.entries(p)) {
    if (skip.has(k)) continue
    if (v == null || v === '') continue
    const label = labelForKey(k)
    if (typeof v === 'object' && !Array.isArray(v)) {
      const nested = objectToLabeledStrings(v, 1)
      if (nested.length === 0) {
        rows.push({ label, value: '—' })
      } else {
        for (const nr of nested) {
          rows.push({ label: `${label} — ${nr.label}`, value: nr.value })
        }
      }
    } else {
      rows.push({ label, value: formatPrimitive(v) })
    }
  }
  return rows
}
