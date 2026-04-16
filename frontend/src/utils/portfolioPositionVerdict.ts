/** Разбор ответа GET /portfolio-analysis/latest (data.items). */

export type PortfolioVerdictCell = {
  finalAction: string
  finalConfidence: number
  reasons: string[]
  portfolioComment?: string
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
    
    const llmPayload = o.llmPayload as Record<string, unknown> | undefined
    const parsed = llmPayload?.parsed as Record<string, unknown> | undefined
    const reasons = Array.isArray(parsed?.reasons) ? parsed.reasons.map(String) : []
    const portfolioComment = typeof llmPayload?.portfolioComment === 'string' ? llmPayload.portfolioComment : undefined

    m.set(figi, {
      finalAction: String(o.finalAction ?? '—'),
      finalConfidence: Number.isFinite(conf) ? conf : 0,
      reasons,
      portfolioComment,
    })
  }
  return m
}
