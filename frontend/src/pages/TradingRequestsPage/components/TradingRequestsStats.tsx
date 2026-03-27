import { SurfaceCard, Text } from '@/components/ui'

export type TradingRequestsStatsData = {
  pending: number
  approved: number
  executed: number
  rejected: number
  canceled: number
  total: number
}

type TradingRequestsStatsProps = {
  stats: TradingRequestsStatsData
}

export function TradingRequestsStats({ stats }: TradingRequestsStatsProps) {
  const cards = [
    { id: 'pending', label: 'Ожидают', value: stats.pending },
    { id: 'approved', label: 'Одобрены', value: stats.approved },
    { id: 'executed', label: 'Исполнены', value: stats.executed },
    { id: 'rejected', label: 'Отклонены', value: stats.rejected },
    { id: 'canceled', label: 'Отменены', value: stats.canceled },
    { id: 'total', label: 'Всего', value: stats.total },
  ]

  return (
    <div className="trading-requests-page__stats-grid">
      {cards.map(card => (
        <SurfaceCard key={card.id} className={`trading-requests-page__stats-card trading-requests-page__stats-card--${card.id}`}>
          <Text as="p" variant="hint" tone="muted">
            {card.label}
          </Text>
          <Text as="p" variant="title">
            {card.value}
          </Text>
        </SurfaceCard>
      ))}
    </div>
  )
}
