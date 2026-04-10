import {
  tradingRequestCanApprove,
  tradingRequestCanCancel,
  tradingRequestCanExecute,
  tradingRequestCanReject,
} from '@/domain/tradingRequestActions'
import { tradingRequestIsTerminalStatus } from '@/domain/tradingRequestTransitions'

export type TradingRequestUiAction = 'approve' | 'reject' | 'execute' | 'cancel'

function isAllowed(status: string, action: TradingRequestUiAction): boolean {
  switch (action) {
    case 'approve':
      return tradingRequestCanApprove(status)
    case 'reject':
      return tradingRequestCanReject(status)
    case 'execute':
      return tradingRequestCanExecute(status)
    case 'cancel':
      return tradingRequestCanCancel(status)
  }
}

/**
 * Если действие недоступно — текст для Tooltip; иначе `null`.
 */
export function tradingRequestActionDisabledReason(
  status: string,
  action: TradingRequestUiAction,
): string | null {
  if (isAllowed(status, action)) return null
  if (tradingRequestIsTerminalStatus(status)) {
    return `Статус «${status}» терминальный — действие недоступно.`
  }
  switch (action) {
    case 'approve':
      return 'Одобрить можно только заявку в статусе PENDING.'
    case 'reject':
      return 'Отклонить можно только заявку в статусе PENDING.'
    case 'execute':
      return 'Исполнить можно заявку в статусе APPROVED или PENDING_MANUAL_REAL.'
    case 'cancel':
      return 'Отменить можно заявку в статусе PENDING, APPROVED или PENDING_MANUAL_REAL.'
  }
}
