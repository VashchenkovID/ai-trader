export type TradingRequestFilterRow = {
  figi: string
  ticker?: string | null
  createdAt?: string | null
}

/**
 * Клиентские фильтры: API списка заявок не поддерживает FIGI/даты — фильтруем выборку.
 */
export function filterTradingRequestRows<T extends TradingRequestFilterRow>(
  rows: T[],
  figiContains: string,
  dateFromIso?: string,
  dateToIso?: string,
): T[] {
  let out = rows
  const q = figiContains.trim().toLowerCase()
  if (q) {
    out = out.filter(
      r =>
        r.figi.toLowerCase().includes(q) ||
        (r.ticker && r.ticker.toLowerCase().includes(q)),
    )
  }
  if (dateFromIso?.trim()) {
    const from = new Date(`${dateFromIso.trim()}T00:00:00`).getTime()
    if (!Number.isNaN(from)) {
      out = out.filter(r => {
        if (!r.createdAt) return false
        const t = new Date(r.createdAt).getTime()
        return !Number.isNaN(t) && t >= from
      })
    }
  }
  if (dateToIso?.trim()) {
    const to = new Date(`${dateToIso.trim()}T23:59:59.999`).getTime()
    if (!Number.isNaN(to)) {
      out = out.filter(r => {
        if (!r.createdAt) return false
        const t = new Date(r.createdAt).getTime()
        return !Number.isNaN(t) && t <= to
      })
    }
  }
  return out
}
