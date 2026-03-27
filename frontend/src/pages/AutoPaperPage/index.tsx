import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AutoPaperTradingService } from '@/api/generated/services/AutoPaperTradingService'
import { Button, PageLayout, Sidebar, SurfaceCard, Text } from '@/components/ui'
import { APP_SIDEBAR_ITEMS, getActiveSidebarItemId, navigateFromSidebar } from '@/navigation/appSidebar'
import '../AppToolPage.scss'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function AutoPaperPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<Record<string, unknown> | null>(null)
  const [stats, setStats] = useState<Record<string, unknown> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [st, stStats] = await Promise.all([
        AutoPaperTradingService.autoPaperStatusApiV1AutoPaperTradingStatusGet(),
        AutoPaperTradingService.autoPaperStatsApiV1AutoPaperTradingStatsGet({}),
      ])
      setStatus(asRecord(st.data))
      setStats(asRecord(stStats.data))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить статус')
      setStatus(null)
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const enabled = Boolean(status?.enabled)
  const mode = String(status?.tradingMode ?? status?.trading_mode ?? '—')

  return (
    <PageLayout
      className="app-tool-page auto-paper-page"
      header={
        <SurfaceCard className="app-tool-page__hero" tone="elevated">
          <Text as="p" variant="eyebrow" tone="muted">
            Paper-режим
          </Text>
          <Text as="h1" variant="display">
            Автоторговля
          </Text>
          <Text as="p" variant="body" tone="muted">
            Статус автоисполнения в paper и краткая статистика. Включение — в разделе «Настройки».
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
      <div className="app-tool-page__section-header">
        <Button variant="secondary" loading={loading} onClick={() => void load()}>
          Обновить
        </Button>
        <Button variant="primary" onClick={() => navigate('/trading-requests')}>
          К торговым заявкам
        </Button>
        <Button variant="secondary" onClick={() => navigate('/settings')}>
          Настройки
        </Button>
      </div>

      {error && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="p" variant="body" tone="danger">
            {error}
          </Text>
        </SurfaceCard>
      )}

      <SurfaceCard className="app-tool-page__section">
        <Text as="h2" variant="title">
          Статус
        </Text>
        <Text as="p" variant="body">
          Включено: {enabled ? 'да' : 'нет'}
        </Text>
        <Text as="p" variant="body">
          Режим торговли (сервер): {mode}
        </Text>
      </SurfaceCard>

      {stats && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="h2" variant="title">
            Статистика
          </Text>
          <pre className="app-tool-page__json">{JSON.stringify(stats, null, 2)}</pre>
        </SurfaceCard>
      )}
    </PageLayout>
  )
}
