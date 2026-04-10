import { tradingRequestStatusCanReach } from '@/domain/tradingRequestTransitions'

/** Действия UI выводятся из графа переходов (`tradingRequestTransitions`). */

export function tradingRequestCanApprove(status: string): boolean {
  return (
    tradingRequestStatusCanReach(status, 'APPROVED') ||
    tradingRequestStatusCanReach(status, 'PENDING_MANUAL_REAL')
  )
}

export function tradingRequestCanReject(status: string): boolean {
  return tradingRequestStatusCanReach(status, 'REJECTED')
}

export function tradingRequestCanExecute(status: string): boolean {
  return tradingRequestStatusCanReach(status, 'EXECUTED')
}

export function tradingRequestCanCancel(status: string): boolean {
  return tradingRequestStatusCanReach(status, 'CANCELLED')
}
