export type RecommendationRecord = Record<string, unknown>

export function recString(r: RecommendationRecord, key: string): string {
  const v = r[key]
  return v == null ? '' : String(v)
}

export function recNum(r: RecommendationRecord, key: string): number | null {
  const v = r[key]
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function formatConfidenceForUi(confidence: number): string {
  // toFixed(2) скрывает малые ненулевые значения (0.004 → «0.00»), что выглядит как «уверенность 0».
  const abs = Math.abs(confidence)
  if (abs === 0) return '0.00'
  if (abs < 0.01) return confidence.toFixed(4)
  return confidence.toFixed(2)
}

export function formatScoreConfidence(score: number | null, confidence: number | null): string {
  const parts: string[] = []
  if (confidence != null) parts.push(`увер. ${formatConfidenceForUi(confidence)}`)
  if (score != null) parts.push(`score ${score.toFixed(2)}`)
  return parts.length ? parts.join(' · ') : '—'
}

export function formatPrice(v: unknown): string {
  if (v == null || v === '') return '—'
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return String(v)
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 4,
  }).format(n)
}
