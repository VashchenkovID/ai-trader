import {
  TRADING_REQUEST_ALLOWED_TRANSITIONS,
  tradingRequestAllowedTargets,
  tradingRequestIsTerminalStatus,
  tradingRequestStatusCanReach,
} from '@/domain/tradingRequestTransitions'

describe('tradingRequestTransitions', () => {
  it('matches backend PENDING outgoing set', () => {
    expect(new Set(tradingRequestAllowedTargets('PENDING'))).toEqual(
      new Set(TRADING_REQUEST_ALLOWED_TRANSITIONS.PENDING),
    )
  })

  it('statusCanReach reflects graph', () => {
    expect(tradingRequestStatusCanReach('PENDING', 'APPROVED')).toBe(true)
    expect(tradingRequestStatusCanReach('PENDING', 'EXECUTED')).toBe(false)
    expect(tradingRequestStatusCanReach('APPROVED', 'EXECUTED')).toBe(true)
    expect(tradingRequestStatusCanReach('EXECUTED', 'CANCELLED')).toBe(false)
  })

  it('terminal flags', () => {
    expect(tradingRequestIsTerminalStatus('EXECUTED')).toBe(true)
    expect(tradingRequestIsTerminalStatus('PENDING')).toBe(false)
  })
})
