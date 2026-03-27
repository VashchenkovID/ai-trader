import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MonitoringService } from '@/api/generated/services/MonitoringService'
import { Button, PageLayout, Select, Sidebar, SurfaceCard, Text, type SelectOption } from '@/components/ui'
import { APP_SIDEBAR_ITEMS, getActiveSidebarItemId, navigateFromSidebar } from '@/navigation/appSidebar'
import '../AppToolPage.scss'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

const severityOptions: SelectOption[] = [
  { value: '', label: 'Все уровни' },
  { value: 'critical', label: 'critical' },
  { value: 'error', label: 'error' },
  { value: 'warning', label: 'warning' },
  { value: 'info', label: 'info' },
]

const resolvedOptions: SelectOption[] = [
  { value: 'false', label: 'Активные' },
  { value: 'true', label: 'Решённые' },
  { value: 'all', label: 'Все' },
]

export function MonitoringAlertsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [severity, setSeverity] = useState('')
  const [resolvedFilter, setResolvedFilter] = useState<'false' | 'true' | 'all'>('false')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resolved =
        resolvedFilter === 'all' ? null : resolvedFilter === 'true'
      const res = await MonitoringService.monitoringAlertsApiV1MonitoringAlertsGet({
        severity: severity || null,
        resolved,
        limit: 100,
      })
      const data = asRecord(res.data)
      const raw = Array.isArray(data.items) ? data.items : Array.isArray(data.alerts) ? data.alerts : []
      setItems(raw.map(x => asRecord(x)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить алерты')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [severity, resolvedFilter])

  useEffect(() => {
    void load()
  }, [load])

  const handleResolve = async (alertId: string) => {
    setBusyId(alertId)
    setError(null)
    try {
      await MonitoringService.resolveAlertApiV1MonitoringAlertsAlertIdResolvePost({ alertId })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось пометить алерт')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <PageLayout
      className="app-tool-page monitoring-alerts-page"
      header={
        <SurfaceCard className="app-tool-page__hero" tone="elevated">
          <Text as="p" variant="eyebrow" tone="muted">
            Надёжность
          </Text>
          <Text as="h1" variant="display">
            Алерты мониторинга
          </Text>
          <Text as="p" variant="body" tone="muted">
            Список алертов платформы, фильтры и пометка «решено».
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
            <Select
              label="Важность"
              value={severity}
              options={severityOptions}
              onChange={e => setSeverity(e.target.value)}
            />
            <Select
              label="Статус"
              value={resolvedFilter}
              options={resolvedOptions}
              onChange={e => setResolvedFilter(e.target.value as 'false' | 'true' | 'all')}
            />
          </div>
          <Button variant="secondary" loading={loading} onClick={() => void load()}>
            Обновить
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

      <SurfaceCard className="app-tool-page__section">
        {items.length === 0 ? (
          <Text as="p" variant="body" tone="muted">
            {loading ? 'Загрузка...' : 'Алертов нет.'}
          </Text>
        ) : (
          <table className="app-tool-page__table">
            <thead>
              <tr>
                <th>Время</th>
                <th>Уровень</th>
                <th>Категория</th>
                <th>Сообщение</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => {
                const id = String(row.id ?? row.alertId ?? `idx-${i}`)
                const msg = String(row.message ?? row.title ?? row.detail ?? '—')
                const sev = String(row.severity ?? '—')
                const cat = String(row.category ?? '—')
                const at = String(row.createdAt ?? row.timestamp ?? row.at ?? '—')
                const isResolved = Boolean(row.resolved)
                return (
                  <tr key={id}>
                    <td className="app-tool-page__mono">{at}</td>
                    <td>{sev}</td>
                    <td>{cat}</td>
                    <td>{msg}</td>
                    <td>
                      {!isResolved && (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={busyId === id}
                          disabled={busyId !== null}
                          onClick={() => void handleResolve(id)}
                        >
                          Решено
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </SurfaceCard>
    </PageLayout>
  )
}
