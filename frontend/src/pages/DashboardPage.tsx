import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MarketService } from '@/api/generated/services/MarketService'
import { MonitoringService } from '@/api/generated/services/MonitoringService'
import { RiskService } from '@/api/generated/services/RiskService'
import { Button, PageLayout, Sidebar, SurfaceCard, Text } from '@/components/ui'
import { APP_SIDEBAR_ITEMS, getActiveSidebarItemId, navigateFromSidebar } from '@/navigation/appSidebar'
import { DashboardHero } from '@/pages/DashboardPage/components/DashboardHero'
import { DashboardKpiRow } from '@/pages/DashboardPage/components/DashboardKpiRow'
import { DashboardRiskAlerts } from '@/pages/DashboardPage/components/DashboardRiskAlerts'
import { DashboardSystemStatus } from '@/pages/DashboardPage/components/DashboardSystemStatus'
import { DashboardTasksPanel } from '@/pages/DashboardPage/components/DashboardTasksPanel'
import { DashboardTopRecommendations } from '@/pages/DashboardPage/components/DashboardTopRecommendations'
import { useSystemStatusStore } from '@/store/systemStatusStore'
import { useTradingCoreStore } from '@/store/tradingCoreStore'
import type { DashboardRecommendation, DashboardTask } from './DashboardPage/types'
import './DashboardPage.scss'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function DashboardPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<DashboardRecommendation[]>([])
  const [recommendationsTotal, setRecommendationsTotal] = useState<number>(0)
  const [alertsTotal, setAlertsTotal] = useState<number>(0)
  const [riskEmergencyStop, setRiskEmergencyStop] = useState<boolean | null>(null)
  const [riskMaxPositionSize, setRiskMaxPositionSize] = useState<number | null>(null)
  const [isRefreshBusy, setIsRefreshBusy] = useState(false)
  const connectionStatus = useSystemStatusStore(state => state.connectionStatus)
  const lastEventAt = useSystemStatusStore(state => state.lastEventAt)
  const tasks = useSystemStatusStore(state => state.tasks)
  const scheduler = useSystemStatusStore(state => state.scheduler)
  const profile = useTradingCoreStore(state => state.profile)
  const tradingMode = useTradingCoreStore(state => state.tradingMode)
  const portfolioKind = useTradingCoreStore(state => state.portfolioKind)
  const totalBalance = useTradingCoreStore(state => state.totalBalance)
  const profitLoss = useTradingCoreStore(state => state.profitLoss)
  const lastPortfolioUpdatedAt = useTradingCoreStore(state => state.lastPortfolioUpdatedAt)
  const refreshPortfolio = useTradingCoreStore(state => state.refreshPortfolio)
  const isCoreLoading = useTradingCoreStore(state => state.isLoading)
  const coreError = useTradingCoreStore(state => state.error)
  const taskActiveCount = useMemo(
    () => tasks.filter(t => t.status === 'queued' || t.status === 'running').length,
    [tasks]
  )
  const taskFailedCount = useMemo(() => tasks.filter(t => t.status === 'failed').length, [tasks])
  const schedulerCount = Object.keys(scheduler).length
  const modeText = String(tradingMode?.mode ?? 'paper').toLowerCase()
  const topTasks: DashboardTask[] = tasks.slice(0, 5).map(task => ({
    taskId: task.taskId,
    taskType: task.taskType,
    status: task.status,
  }))

  const activeSidebarItemId = getActiveSidebarItemId(location.pathname)

  const loadDashboard = async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const [recRes, alertsRes, riskRes] = await Promise.all([
        MarketService.marketRecommendationsApiV1MarketRecommendationsGet({ offset: 0, limit: 5 }),
        MonitoringService.monitoringAlertsApiV1MonitoringAlertsGet({ resolved: false, limit: 50 }),
        RiskService.riskStatusApiV1RiskStatusGet(),
      ])

      const recData = asRecord(recRes.data)
      const recItems = Array.isArray(recData.items) ? recData.items : []
      const recMapped = recItems.map((item, index) => {
        const rec = asRecord(item)
        return {
          id: String(rec.id ?? rec.figi ?? `rec-${index}`),
          figi: String(rec.figi ?? ''),
          ticker: String(rec.ticker ?? '—'),
          name: String(rec.name ?? 'Без названия'),
          recommendation: String(rec.recommendation ?? 'UNKNOWN'),
          confidence: asNumber(rec.confidence),
          score: asNumber(rec.score),
          paperRecommendation:
            (rec.paperRecommendation as string | undefined) ??
            (rec.paper_recommendation as string | undefined) ??
            null,
          paperConfidence: asNumber(rec.paperConfidence) ?? asNumber(rec.paper_confidence),
          paperScore: asNumber(rec.paperScore) ?? asNumber(rec.paper_score),
        }
      })
      const recMeta = asRecord(recData.meta)

      const alertsData = asRecord(alertsRes.data)
      const alertsItems = Array.isArray(alertsData.items) ? alertsData.items : []

      const riskData = asRecord(riskRes.data)
      const riskLimits = asRecord(riskData.limits)

      setRecommendations(recMapped)
      setRecommendationsTotal(asNumber(recMeta.total) ?? recMapped.length)
      setAlertsTotal(alertsItems.length)
      setRiskEmergencyStop(Boolean(riskData.emergencyStop))
      setRiskMaxPositionSize(asNumber(riskLimits.maxPositionSize))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить данные главной страницы'
      setLoadError(message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadDashboard()
  }, [])

  const handleRefreshAll = async () => {
    if (isRefreshBusy) return
    setIsRefreshBusy(true)
    setLoadError(null)
    try {
      await MarketService.marketRefreshApiV1MarketRefreshPost()
      await refreshPortfolio('api')
      await loadDashboard()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Не удалось обновить данные. Повторите позже.'
      setLoadError(message)
    } finally {
      setIsRefreshBusy(false)
    }
  }

  const handleSidebarSelect = (itemId: string) => {
    navigateFromSidebar(navigate, itemId)
  }

  return (
    <PageLayout
      className="dashboard-page"
      header={<DashboardHero />}
      sidebar={
        <Sidebar
          title="Навигация"
          items={APP_SIDEBAR_ITEMS}
          activeItemId={activeSidebarItemId}
          onSelect={handleSidebarSelect}
        />
      }
    >
      <div className="dashboard-page__quick-links">
        <Button variant="secondary" onClick={() => navigate('/portfolio')}>
          Портфель
        </Button>
        <Button variant="secondary" onClick={() => navigate('/monitoring/alerts')}>
          Алерты
        </Button>
        <Button variant="secondary" onClick={() => navigate('/trading-requests')}>
          Заявки
        </Button>
        <Button variant="secondary" onClick={() => navigate('/auto-paper')}>
          Автоторговля
        </Button>
        <Button variant="secondary" onClick={() => navigate('/performance')}>
          Производительность
        </Button>
      </div>
      <DashboardKpiRow
        totalBalance={totalBalance}
        profitLoss={profitLoss}
        taskActiveCount={taskActiveCount}
        alertsTotal={alertsTotal}
      />
      <div className="dashboard-page__main-grid">
        <div className="dashboard-page__slot dashboard-page__slot--system">
          <DashboardSystemStatus
            username={profile?.username ?? null}
            modeText={modeText}
            portfolioKind={portfolioKind}
            connectionStatus={connectionStatus}
            taskFailedCount={taskFailedCount}
            schedulerCount={schedulerCount}
            lastEventAt={lastEventAt}
            lastPortfolioUpdatedAt={lastPortfolioUpdatedAt}
            isRefreshBusy={isRefreshBusy}
            onRefresh={() => void handleRefreshAll()}
          />
        </div>
        <div className="dashboard-page__slot dashboard-page__slot--risk">
          <DashboardRiskAlerts
            riskEmergencyStop={riskEmergencyStop}
            riskMaxPositionSize={riskMaxPositionSize}
            alertsTotal={alertsTotal}
          />
        </div>
        <div className="dashboard-page__slot dashboard-page__slot--recommendations">
          <DashboardTopRecommendations
            recommendations={recommendations}
            recommendationsTotal={recommendationsTotal}
            isLoading={isLoading}
            onOpenAll={() => navigate('/recommendations')}
            onOpenOne={figi => navigate(`/recommendations/${encodeURIComponent(figi)}`)}
          />
        </div>
        <div className="dashboard-page__slot dashboard-page__slot--tasks">
          <DashboardTasksPanel tasks={topTasks} />
        </div>
      </div>

      {(isLoading || isCoreLoading) && (
        <SurfaceCard>
          <Text as="p" variant="body" tone="muted">
            Загрузка данных дашборда...
          </Text>
        </SurfaceCard>
      )}

      {(loadError || coreError) && (
        <SurfaceCard>
          {loadError && (
            <Text as="p" variant="body" tone="danger">
              Ошибка загрузки dashboard API: {loadError}
            </Text>
          )}
          {coreError && (
            <Text as="p" variant="body" tone="danger">
              Ошибка core данных: {coreError}
            </Text>
          )}
        </SurfaceCard>
      )}
    </PageLayout>
  )
}
