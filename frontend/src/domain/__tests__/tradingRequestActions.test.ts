import {
  tradingRequestCanApprove,
  tradingRequestCanCancel,
  tradingRequestCanExecute,
  tradingRequestCanReject,
} from '@/domain/tradingRequestActions'

describe('tradingRequestActions', () => {
  it('approve/reject only for PENDING', () => {
    expect(tradingRequestCanApprove('PENDING')).toBe(true)
    expect(tradingRequestCanReject('PENDING')).toBe(true)
    expect(tradingRequestCanApprove('APPROVED')).toBe(false)
    expect(tradingRequestCanReject('EXECUTED')).toBe(false)
  })

  it('execute for APPROVED and PENDING_MANUAL_REAL', () => {
    expect(tradingRequestCanExecute('APPROVED')).toBe(true)
    expect(tradingRequestCanExecute('PENDING_MANUAL_REAL')).toBe(true)
    expect(tradingRequestCanExecute('PENDING')).toBe(false)
  })

  it('cancel for active non-terminal', () => {
    expect(tradingRequestCanCancel('PENDING')).toBe(true)
    expect(tradingRequestCanCancel('APPROVED')).toBe(true)
    expect(tradingRequestCanCancel('PENDING_MANUAL_REAL')).toBe(true)
    expect(tradingRequestCanCancel('EXECUTED')).toBe(false)
  })
})
