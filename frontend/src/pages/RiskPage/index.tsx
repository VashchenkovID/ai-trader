import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { RiskService } from '@/api/generated/services/RiskService'
import { Button, PageLayout, Sidebar, SurfaceCard, Text } from '@/components/ui'
import { APP_SIDEBAR_ITEMS, getActiveSidebarItemId, navigateFromSidebar } from '@/navigation/appSidebar'
import '../AppToolPage.scss'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function RiskPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<Record<string, unknown> | null>(null)
  const [limits, setLimits] = useState<Record<string, unknown> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [st, lim] = await Promise.all([
        RiskService.riskStatusApiV1RiskStatusGet(),
        RiskService.riskLimitsApiV1RiskLimitsGet(),
      ])
      setStatus(asRecord(st.data))
      setLimits(asRecord(lim.data))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить риск')
      setStatus(null)
      setLimits(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <PageLayout
      className="app-tool-page risk-page"
      header={
        <SurfaceCard className="app-tool-page__hero" tone="elevated">
          <Text as="p" variant="eyebrow" tone="muted">
            Контроль риска
          </Text>
          <Text as="h1" variant="display">
            Риск-менеджмент
          </Text>
          <Text as="p" variant="body" tone="muted">
            Статус, лимиты и параметры из API риска. Изменение лимитов — через API (при необходимости расширим форму).
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
      </div>

      {error && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="p" variant="body" tone="danger">
            {error}
          </Text>
        </SurfaceCard>
      )}

      {status && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="h2" variant="title">
            Статус
          </Text>
          <pre className="app-tool-page__json">{JSON.stringify(status, null, 2)}</pre>
        </SurfaceCard>
      )}

      {limits && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="h2" variant="title">
            Лимиты
          </Text>
          <pre className="app-tool-page__json">{JSON.stringify(limits, null, 2)}</pre>
        </SurfaceCard>
      )}
    </PageLayout>
  )
}
