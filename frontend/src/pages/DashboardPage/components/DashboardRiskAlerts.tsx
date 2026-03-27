import { SurfaceCard, Text } from '@/components/ui'

type DashboardRiskAlertsProps = {
  riskEmergencyStop: boolean | null
  riskMaxPositionSize: number | null
  alertsTotal: number
}

export function DashboardRiskAlerts({
  riskEmergencyStop,
  riskMaxPositionSize,
  alertsTotal,
}: DashboardRiskAlertsProps) {
  return (
    <SurfaceCard className="dashboard-page__section">
      <Text as="h2" variant="title">
        Риск и предупреждения
      </Text>
      <div className="dashboard-page__grid2">
        <Text as="p" variant="body">
          Экстренная остановка:{' '}
          <strong>
            {riskEmergencyStop == null ? '—' : riskEmergencyStop ? 'включена' : 'выключена'}
          </strong>
        </Text>
        <Text as="p" variant="body">
          Лимит позиции:{' '}
          <strong>
            {riskMaxPositionSize == null ? '—' : `${Math.round(riskMaxPositionSize * 100)}%`}
          </strong>
        </Text>
        <Text as="p" variant="body">
          Активные алерты мониторинга: <strong>{alertsTotal}</strong>
        </Text>
      </div>
    </SurfaceCard>
  )
}
