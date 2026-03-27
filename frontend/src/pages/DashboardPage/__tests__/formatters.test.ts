import { formatAgo, formatMoney, formatPercent01 } from '../formatters'

describe('Dashboard formatters', () => {
  it('formatMoney uses RUB', () => {
    expect(formatMoney(1_234_567)).toMatch(/1[\s\u00A0]*234[\s\u00A0]*567/)
  })

  it('formatPercent01 handles null', () => {
    expect(formatPercent01(null)).toBe('—')
  })

  it('formatPercent01 rounds percent', () => {
    expect(formatPercent01(0.1234)).toBe('12%')
  })

  it('formatAgo returns dash for empty', () => {
    expect(formatAgo(null)).toBe('—')
  })

  it('formatAgo formats valid ISO date', () => {
    const s = formatAgo('2026-03-15T14:30:00.000Z')
    expect(s).not.toBe('—')
    expect(s.length).toBeGreaterThan(3)
  })
})
