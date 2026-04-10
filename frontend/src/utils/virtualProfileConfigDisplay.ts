import type { LabeledValueRow } from '@/components/ops/LabeledValuesTable'

const FIELDS: Record<string, { label: string; hint: string; format: 'percent' | 'fraction' | 'days' }> = {
  signal_min_score: {
    label: 'Минимальный скоринг сигнала',
    hint: 'Порог score (0–1), ниже которого сигнал не принимается для профиля.',
    format: 'percent',
  },
  signal_min_confidence: {
    label: 'Минимальная уверенность сигнала',
    hint: 'Порог confidence (0–1) для входа в сделки в рамках профиля.',
    format: 'percent',
  },
  max_position_fraction: {
    label: 'Макс. доля одной позиции',
    hint: 'Максимальная доля портфеля в одной позиции (поверх глобальных risk.limits).',
    format: 'fraction',
  },
  max_total_exposure_fraction: {
    label: 'Макс. суммарная экспозиция',
    hint: 'Предел суммарной доли капитала в позициях.',
    format: 'fraction',
  },
  rebalance_days: {
    label: 'Период ребаланса',
    hint: 'Через сколько дней ожидается пересмотр/ребаланс (если задано).',
    format: 'days',
  },
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  const meta = FIELDS[key]
  const n = typeof value === 'number' ? value : Number(value)
  if (meta?.format === 'days') {
    if (!Number.isFinite(n)) return String(value)
    return `${Math.round(n)} дн.`
  }
  if (meta?.format === 'percent' || meta?.format === 'fraction') {
    if (!Number.isFinite(n)) return String(value)
    return `${(n * 100).toFixed(1)}%`
  }
  if (typeof value === 'boolean') return value ? 'да' : 'нет'
  return String(value)
}

export function virtualProfileConfigToRows(cfg: Record<string, unknown>): LabeledValueRow[] {
  const knownKeys = Object.keys(FIELDS)
  const rows: LabeledValueRow[] = []
  for (const key of knownKeys) {
    if (!(key in cfg)) continue
    const meta = FIELDS[key]
    rows.push({
      label: meta.label,
      hint: meta.hint,
      value: formatValue(key, cfg[key]),
    })
  }
  for (const [key, value] of Object.entries(cfg)) {
    if (key in FIELDS) continue
    rows.push({
      label: `Доп. параметр: ${key}`,
      hint: 'Поле не описано в UI — уточните в настройках или документации API.',
      value: formatValue(key, value),
    })
  }
  return rows
}
