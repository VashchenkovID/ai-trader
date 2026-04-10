import { filterTradingRequestRows } from '@/utils/tradingRequestFilters'

describe('filterTradingRequestRows', () => {
  const rows = [
    { figi: 'BBG001', ticker: 'SBER', createdAt: '2026-01-15T12:00:00Z' },
    { figi: 'BBG002', ticker: 'GAZP', createdAt: '2026-02-20T08:00:00Z' },
  ]

  it('filters by figi substring', () => {
    expect(filterTradingRequestRows(rows, 'bbg001', undefined, undefined)).toHaveLength(1)
  })

  it('filters by ticker', () => {
    expect(filterTradingRequestRows(rows, 'gazp', undefined, undefined)).toHaveLength(1)
  })

  it('filters by date range', () => {
    const r = filterTradingRequestRows(rows, '', '2026-02-01', '2026-02-28')
    expect(r).toHaveLength(1)
    expect(r[0].figi).toBe('BBG002')
  })
})
