/**
 * Допустимые переходы статусов торговых заявок.
 * Синхронизировать с `server_fastapi/app/services/trading_request_service.py` → `_ALLOWED_TRANSITIONS`.
 */
export const TRADING_REQUEST_ALLOWED_TRANSITIONS: Readonly<
  Record<string, readonly string[]>
> = {
  PENDING: ['APPROVED', 'PENDING_MANUAL_REAL', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  APPROVED: ['EXECUTED', 'CANCELLED'],
  PENDING_MANUAL_REAL: ['EXECUTED', 'CANCELLED'],
  REJECTED: [],
  EXECUTED: [],
  CANCELLED: [],
  EXPIRED: [],
}

const TERMINAL = new Set(['REJECTED', 'EXECUTED', 'CANCELLED', 'EXPIRED'])

export function tradingRequestAllowedTargets(status: string): readonly string[] {
  return TRADING_REQUEST_ALLOWED_TRANSITIONS[status] ?? []
}

export function tradingRequestStatusCanReach(from: string, to: string): boolean {
  return tradingRequestAllowedTargets(from).includes(to)
}

export function tradingRequestIsTerminalStatus(status: string): boolean {
  return TERMINAL.has(status)
}
