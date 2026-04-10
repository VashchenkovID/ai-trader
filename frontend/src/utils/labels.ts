export function labelTradingRequestStatus(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim().toUpperCase()
  const map: Record<string, string> = {
    PENDING: 'Ожидает',
    APPROVED: 'Одобрено',
    EXECUTED: 'Исполнено',
    REJECTED: 'Отклонено',
    CANCELED: 'Отменено',
    CANCELLED: 'Отменено',
    PENDING_MANUAL_REAL: 'Ожидает ручного исполнения (real)',
  }
  return map[s] ?? (raw == null || String(raw).trim() === '' ? '—' : String(raw))
}

export function labelTradingMode(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim().toLowerCase()
  const map: Record<string, string> = {
    paper: 'Бумажный',
    real: 'Реальный',
    micro: 'Микро',
  }
  return map[s] ?? (raw == null || String(raw).trim() === '' ? '—' : String(raw))
}

export function labelRecommendation(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim().toUpperCase()
  const map: Record<string, string> = {
    BUY: 'ПОКУПАТЬ',
    SELL: 'ПРОДАВАТЬ',
    HOLD: 'ДЕРЖАТЬ',
    UNKNOWN: 'НЕИЗВЕСТНО',
  }
  return map[s] ?? (raw == null || String(raw).trim() === '' ? '—' : String(raw))
}

