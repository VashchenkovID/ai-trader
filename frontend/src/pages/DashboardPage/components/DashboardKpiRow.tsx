import { SurfaceCard, Text } from '@/components/ui'
import { formatMoney } from '../formatters'

type DashboardKpiRowProps = {
  totalBalance: number
  profitLoss: number
  taskActiveCount: number
  alertsTotal: number
}

export function DashboardKpiRow({
  totalBalance,
  profitLoss,
  taskActiveCount,
  alertsTotal,
}: DashboardKpiRowProps) {
  return (
    <SurfaceCard className="dashboard-page__kpi">
      <div className="dashboard-page__kpi-grid">
        <div className="dashboard-page__kpi-item">
          <Text as="p" variant="hint" tone="muted">
            Баланс портфеля
          </Text>
          <Text as="p" variant="title">
            {formatMoney(totalBalance)}
          </Text>
        </div>
        <div className="dashboard-page__kpi-item">
          <Text as="p" variant="hint" tone="muted">
            P&L
          </Text>
          <Text as="p" variant="title">
            {formatMoney(profitLoss)}
          </Text>
        </div>
        <div className="dashboard-page__kpi-item">
          <Text as="p" variant="hint" tone="muted">
            Активные задачи
          </Text>
          <Text as="p" variant="title">
            {taskActiveCount}
          </Text>
        </div>
        <div className="dashboard-page__kpi-item">
          <Text as="p" variant="hint" tone="muted">
            Активные алерты
          </Text>
          <Text as="p" variant="title">
            {alertsTotal}
          </Text>
        </div>
      </div>
    </SurfaceCard>
  )
}
