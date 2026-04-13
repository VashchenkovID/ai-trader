/** Разбор ответа GET /portfolio-analysis/latest (data.items). */

export type PortfolioVerdictCell = {
  finalAction: string
  finalConfidence: number
}

export function parseLatestVerdictMap(data: unknown): Map<string, PortfolioVerdictCell> {
  const m = new Map<string, PortfolioVerdictCell>()
  if (!data || typeof data !== 'object') return m
  const items = (data as Record<string, unknown>).items
  if (!Array.isArray(items)) return m
  for (const it of items) {
    if (!it || typeof it !== 'object') continue
    const o = it as Record<string, unknown>
    const figi = String(o.figi ?? '').trim()
    if (!figi) continue
    const conf = typeof o.finalConfidence === 'number' ? o.finalConfidence : Number(o.finalConfidence)
    m.set(figi, {
      finalAction: String(o.finalAction ?? '—'),
      finalConfidence: Number.isFinite(conf) ? conf : 0,
    })
  }
  return m
}
