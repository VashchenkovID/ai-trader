import { tradingRequestActionDisabledReason } from '@/domain/tradingRequestUiHints'

describe('tradingRequestUiHints', () => {
  it('returns null when action allowed', () => {
    expect(tradingRequestActionDisabledReason('PENDING', 'approve')).toBeNull()
    expect(tradingRequestActionDisabledReason('PENDING', 'reject')).toBeNull()
    expect(tradingRequestActionDisabledReason('PENDING', 'cancel')).toBeNull()
    expect(tradingRequestActionDisabledReason('APPROVED', 'execute')).toBeNull()
    expect(tradingRequestActionDisabledReason('APPROVED', 'cancel')).toBeNull()
    expect(tradingRequestActionDisabledReason('PENDING_MANUAL_REAL', 'execute')).toBeNull()
  })

  it('explains terminal status', () => {
    const r = tradingRequestActionDisabledReason('EXECUTED', 'approve')
    expect(r).toContain('терминальн')
  })

  it('explains wrong status for execute', () => {
    const r = tradingRequestActionDisabledReason('PENDING', 'execute')
    expect(r).toContain('APPROVED')
  })

  it('explains approve/reject only from PENDING', () => {
    expect(tradingRequestActionDisabledReason('APPROVED', 'approve')).toContain('PENDING')
    expect(tradingRequestActionDisabledReason('APPROVED', 'reject')).toContain('PENDING')
  })

  it('explains cancel from wrong status', () => {
    expect(tradingRequestActionDisabledReason('REJECTED', 'cancel')).toContain('терминальн')
    expect(tradingRequestActionDisabledReason('PENDING', 'cancel')).toBeNull()
    expect(tradingRequestActionDisabledReason('UNKNOWN', 'cancel')).toContain('Отменить')
  })
})
