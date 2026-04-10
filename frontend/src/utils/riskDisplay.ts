import type { LabeledValueRow } from '@/components/ops/LabeledValuesTable'

const LIMIT_LABELS: Record<string, { label: string; hint: string; format: 'fraction' | 'int' | 'confidence' }> = {
  maxPositionSize: {
    label: 'Макс. размер одной позиции',
    hint: 'Доля портфеля, которую можно вложить в одну позицию.',
    format: 'fraction',
  },
  maxTotalExposure: {
    label: 'Макс. суммарная экспозиция',
    hint: 'Предельная доля капитала в открытых позициях.',
    format: 'fraction',
  },
  maxDailyLoss: {
    label: 'Макс. дневной убыток',
    hint: 'Допустимая доля просадки за день.',
    format: 'fraction',
  },
  maxConsecutiveLosses: {
    label: 'Макс. убыточных сделок подряд',
    hint: 'После превышения может сработать стоп торговли.',
    format: 'int',
  },
  minConfidence: {
    label: 'Мин. уверенность сигнала',
    hint: 'Нижний порог confidence для входа в сделку.',
    format: 'confidence',
  },
}

function formatLimitValue(key: string, value: unknown): string {
  const meta = LIMIT_LABELS[key]
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return String(value)
  if (!meta) return String(n)
  if (meta.format === 'fraction' || meta.format === 'confidence') {
    return `${(n * 100).toFixed(1)}%`
  }
  return String(Math.round(n))
}

export function riskLimitsToRows(limits: Record<string, unknown> | null | undefined): LabeledValueRow[] {
  if (!limits) return []
  return Object.entries(limits).map(([key, value]) => {
    const meta = LIMIT_LABELS[key]
    return {
      label: meta?.label ?? key,
      hint: meta?.hint,
      value: formatLimitValue(key, value),
    }
  })
}

export function riskStatsToRows(stats: Record<string, unknown> | null | undefined): LabeledValueRow[] {
  if (!stats) return []
  const rows: LabeledValueRow[] = []
  const daily = stats.dailyPnL
  if (daily != null) {
    const n = typeof daily === 'number' ? daily : Number(daily)
    rows.push({
      label: 'Дневной P&L (оценка)',
      hint: 'Накопленное изменение за текущий торговый день в логике риск-сервиса.',
      value: Number.isFinite(n) ? n.toFixed(2) : String(daily),
    })
  }
  const cons = stats.consecutiveLosses
  if (cons != null) {
    rows.push({
      label: 'Убыточных сделок подряд',
      hint: 'Счётчик подряд идущих убыточных исполнений.',
      value: String(cons),
    })
  }
  return rows
}

const PREFLIGHT_CHECK_LABELS: Record<string, string> = {
  risk: 'Риск-лимиты',
  tradingMode: 'Режим торговли',
  autoPaper: 'Автоторговля (paper)',
}

export function preflightCheckToRows(name: string, payload: unknown): LabeledValueRow[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [{ label: 'Значение', value: String(payload) }]
  }
  const o = payload as Record<string, unknown>
  const title = PREFLIGHT_CHECK_LABELS[name] ?? name
  const rows: LabeledValueRow[] = [
    { label: 'Раздел', hint: 'Имя проверки preflight на бэкенде.', value: title },
  ]
  for (const [k, v] of Object.entries(o)) {
    if (k === 'limits' && v && typeof v === 'object') {
      rows.push({
        label: 'Лимиты (срез)',
        value: Object.entries(v as Record<string, unknown>)
          .map(([lk, lv]) => `${lk}: ${formatLimitValue(lk, lv)}`)
          .join('; '),
      })
      continue
    }
    rows.push({
      label: k === 'status' ? 'Статус' : k === 'mode' ? 'Режим' : k === 'enabled' ? 'Включено' : k,
      value: typeof v === 'boolean' ? (v ? 'да' : 'нет') : String(v),
    })
  }
  return rows
}
