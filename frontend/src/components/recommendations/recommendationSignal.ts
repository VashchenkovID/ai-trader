/** Значения сигнала рекомендации с API (BUY / SELL / HOLD). */
export enum RecommendationSignal {
  Buy = 'BUY',
  Sell = 'SELL',
  Hold = 'HOLD',
  Unknown = 'UNKNOWN',
}

const RU_LABELS: Record<RecommendationSignal, string> = {
  [RecommendationSignal.Buy]: 'ПОКУПКА',
  [RecommendationSignal.Sell]: 'ПРОДАЖА',
  [RecommendationSignal.Hold]: 'УДЕРЖАНИЕ',
  [RecommendationSignal.Unknown]: 'НЕИЗВЕСТНО',
}

export function parseRecommendationSignal(raw: string | null | undefined): RecommendationSignal {
  const s = String(raw ?? '')
    .trim()
    .toUpperCase()
  if (s === RecommendationSignal.Buy) return RecommendationSignal.Buy
  if (s === RecommendationSignal.Sell) return RecommendationSignal.Sell
  if (s === RecommendationSignal.Hold) return RecommendationSignal.Hold
  return RecommendationSignal.Unknown
}

/** Подпись для текста (пусто → «—», неизвестное непустое значение → «НЕИЗВЕСТНО»). */
export function recommendationSignalLabelRu(raw: string | null | undefined): string {
  const trimmed = String(raw ?? '').trim()
  if (trimmed === '') return '—'
  const sig = parseRecommendationSignal(trimmed)
  if (sig === RecommendationSignal.Unknown) return RU_LABELS[RecommendationSignal.Unknown]
  return RU_LABELS[sig]
}

export function ruLabelForKnownRecommendationSignal(
  sig: RecommendationSignal.Buy | RecommendationSignal.Sell | RecommendationSignal.Hold
): string {
  return RU_LABELS[sig]
}
