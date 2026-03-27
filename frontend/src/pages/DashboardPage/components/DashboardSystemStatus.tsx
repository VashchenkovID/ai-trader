import { Button, SurfaceCard, Text } from '@/components/ui'
import { formatAgo } from '../formatters'

type DashboardSystemStatusProps = {
  username: string | null
  modeText: string
  portfolioKind: string | null
  connectionStatus: string
  taskFailedCount: number
  schedulerCount: number
  lastEventAt: string | null
  lastPortfolioUpdatedAt: string | null
  isRefreshBusy: boolean
  onRefresh: () => void
}

export function DashboardSystemStatus({
  username,
  modeText,
  portfolioKind,
  connectionStatus,
  taskFailedCount,
  schedulerCount,
  lastEventAt,
  lastPortfolioUpdatedAt,
  isRefreshBusy,
  onRefresh,
}: DashboardSystemStatusProps) {
  return (
    <SurfaceCard className="dashboard-page__section">
      <div className="dashboard-page__section-header">
        <Text as="h2" variant="title">
          Состояние системы
        </Text>
        <Button variant="secondary" loading={isRefreshBusy} onClick={onRefresh}>
          Обновить данные
        </Button>
      </div>
      <div className="dashboard-page__grid2">
        <Text as="p" variant="body">
          Пользователь: <strong>{username ?? '—'}</strong>
        </Text>
        <Text as="p" variant="body">
          Режим: <strong>{modeText}</strong>
        </Text>
        <Text as="p" variant="body">
          Контур портфеля: <strong>{portfolioKind ?? '—'}</strong>
        </Text>
        <Text as="p" variant="body">
          WebSocket: <strong>{connectionStatus}</strong>
        </Text>
        <Text as="p" variant="body">
          Задач с ошибкой: <strong>{taskFailedCount}</strong>
        </Text>
        <Text as="p" variant="body">
          Scheduler jobs: <strong>{schedulerCount}</strong>
        </Text>
        <Text as="p" variant="hint" tone="muted">
          Последнее WS-событие: {formatAgo(lastEventAt)} · Портфель обновлен:{' '}
          {formatAgo(lastPortfolioUpdatedAt)}
        </Text>
      </div>
    </SurfaceCard>
  )
}
