import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PerformanceService } from '@/api/generated/services/PerformanceService'
import { ProfitabilityService } from '@/api/generated/services/ProfitabilityService'
import { Button, Input, PageLayout, Sidebar, SurfaceCard, Text } from '@/components/ui'
import { APP_SIDEBAR_ITEMS, getActiveSidebarItemId, navigateFromSidebar } from '@/navigation/appSidebar'
import '../AppToolPage.scss'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function PerformancePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState('30')
  const [daysSector, setDaysSector] = useState('30')
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null)
  const [sectors, setSectors] = useState<Record<string, unknown> | null>(null)
  const [profitReport, setProfitReport] = useState<Record<string, unknown> | null>(null)
  const [profitAnalysis, setProfitAnalysis] = useState<Record<string, unknown> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const p = Number(period) || 30
    const d = Number(daysSector) || 30
    try {
      const [dash, sec, rep, ana] = await Promise.all([
        PerformanceService.performanceDashboardApiV1PerformanceVisualizationDashboardGet({
          period: p,
          strategy: null,
          sector: null,
        }),
        PerformanceService.performanceSectorAnalysisApiV1PerformanceSectorAnalysisGet({
          days: d,
          offset: 0,
          limit: 200,
        }),
        ProfitabilityService.profitabilityReportApiV1ProfitabilityReportGet(),
        ProfitabilityService.profitabilityAnalysisApiV1ProfitabilityAnalysisGet(),
      ])
      setDashboard(asRecord(dash.data))
      setSectors(asRecord(sec.data))
      setProfitReport(asRecord(rep.data))
      setProfitAnalysis(asRecord(ana.data))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
      setDashboard(null)
      setSectors(null)
      setProfitReport(null)
      setProfitAnalysis(null)
    } finally {
      setLoading(false)
    }
  }, [period, daysSector])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <PageLayout
      className="app-tool-page performance-page"
      header={
        <SurfaceCard className="app-tool-page__hero" tone="elevated">
          <Text as="p" variant="eyebrow" tone="muted">
            Аналитика
          </Text>
          <Text as="h1" variant="display">
            Производительность и PnL
          </Text>
          <Text as="p" variant="body" tone="muted">
            Дашборд производительности, сектора и блок прибыльности.
          </Text>
        </SurfaceCard>
      }
      sidebar={
        <Sidebar
          title="Навигация"
          items={APP_SIDEBAR_ITEMS}
          activeItemId={getActiveSidebarItemId(location.pathname)}
          onSelect={id => navigateFromSidebar(navigate, id)}
        />
      }
    >
      <SurfaceCard className="app-tool-page__section">
        <div className="app-tool-page__section-header">
          <div className="app-tool-page__filters">
            <Input
              label="Период дашборда (дней)"
              type="number"
              min={1}
              value={period}
              onChange={e => setPeriod(e.target.value)}
            />
            <Input
              label="Сектора: дней"
              type="number"
              min={1}
              value={daysSector}
              onChange={e => setDaysSector(e.target.value)}
            />
          </div>
          <Button variant="secondary" loading={loading} onClick={() => void load()}>
            Загрузить
          </Button>
        </div>
      </SurfaceCard>

      {error && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="p" variant="body" tone="danger">
            {error}
          </Text>
        </SurfaceCard>
      )}

      {dashboard && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="h2" variant="title">
            Дашборд производительности
          </Text>
          <pre className="app-tool-page__json">{JSON.stringify(dashboard, null, 2)}</pre>
        </SurfaceCard>
      )}

      {sectors && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="h2" variant="title">
            Сектора
          </Text>
          <pre className="app-tool-page__json">{JSON.stringify(sectors, null, 2)}</pre>
        </SurfaceCard>
      )}

      {profitReport && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="h2" variant="title">
            Отчёт прибыльности
          </Text>
          <pre className="app-tool-page__json">{JSON.stringify(profitReport, null, 2)}</pre>
        </SurfaceCard>
      )}

      {profitAnalysis && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="h2" variant="title">
            Анализ прибыльности
          </Text>
          <pre className="app-tool-page__json">{JSON.stringify(profitAnalysis, null, 2)}</pre>
        </SurfaceCard>
      )}
    </PageLayout>
  )
}
