import { Button, SurfaceCard, Text } from '@/components/ui'

export type TradingRequestRow = {
  requestId: string
  ticker: string
  figi: string
  action: string
  quantity: number | null
  price: number | null
  amount: number | null
  status: string
  mode: string
  createdAt: string
  updatedAt: string
  comment: string | null
  reason: string | null
}

type TradingRequestsTableProps = {
  rows: TradingRequestRow[]
  busyRequestId: string | null
  onApprove: (requestId: string) => void
  onReject: (requestId: string) => void
  onExecute: (requestId: string) => void
  onCancel: (requestId: string) => void
}

function toStatusClass(status: string): string {
  const v = status.trim().toLowerCase()
  if (v === 'pending') return 'pending'
  if (v === 'approved') return 'approved'
  if (v === 'executed') return 'executed'
  if (v === 'rejected') return 'rejected'
  if (v === 'canceled') return 'canceled'
  return 'unknown'
}

export function TradingRequestsTable({
  rows,
  busyRequestId,
  onApprove,
  onReject,
  onExecute,
  onCancel,
}: TradingRequestsTableProps) {
  return (
    <div className="trading-requests-page__table-grid">
      {rows.map(row => {
        const canApproveReject = row.status === 'PENDING'
        const canExecuteCancel = row.status === 'APPROVED'
        const busy = busyRequestId === row.requestId
        return (
          <SurfaceCard className="trading-requests-page__row" key={row.requestId}>
            <div className="trading-requests-page__row-head">
              <Text as="p" variant="label">
                {row.ticker} ({row.figi})
              </Text>
              <span className={`trading-requests-page__status-badge trading-requests-page__status-badge--${toStatusClass(row.status)}`}>
                {row.status}
              </span>
            </div>
            <div className="trading-requests-page__row-grid">
              <Text as="p" variant="hint" tone="muted">ID заявки: {row.requestId}</Text>
              <Text as="p" variant="body">Действие: {row.action}</Text>
              <Text as="p" variant="body">Количество: {row.quantity ?? '—'}</Text>
              <Text as="p" variant="body">Цена: {row.price ?? '—'}</Text>
              <Text as="p" variant="body">Сумма: {row.amount ?? '—'}</Text>
              <Text as="p" variant="body">Режим: {row.mode}</Text>
              <Text as="p" variant="hint" tone="muted">Создана: {row.createdAt || '—'}</Text>
              <Text as="p" variant="hint" tone="muted">Обновлена: {row.updatedAt || '—'}</Text>
              {row.comment && (
                <Text as="p" variant="hint" tone="muted">
                  Комментарий: {row.comment}
                </Text>
              )}
              {row.reason && (
                <Text as="p" variant="hint" tone="muted">
                  Причина: {row.reason}
                </Text>
              )}
            </div>
            <div className="trading-requests-page__row-actions">
              <Button variant="secondary" disabled={!canApproveReject || busy} onClick={() => onApprove(row.requestId)}>
                Одобрить
              </Button>
              <Button variant="secondary" disabled={!canApproveReject || busy} onClick={() => onReject(row.requestId)}>
                Отклонить
              </Button>
              <Button variant="secondary" disabled={!canExecuteCancel || busy} onClick={() => onExecute(row.requestId)}>
                Исполнить
              </Button>
              <Button variant="danger" loading={busy} disabled={!canExecuteCancel || busy} onClick={() => onCancel(row.requestId)}>
                Отменить
              </Button>
            </div>
          </SurfaceCard>
        )
      })}
    </div>
  )
}
