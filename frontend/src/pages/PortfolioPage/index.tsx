import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PortfolioService } from '@/api/generated/services/PortfolioService'
import { Button, PageLayout, Sidebar, SurfaceCard, Text } from '@/components/ui'
import { APP_SIDEBAR_ITEMS, getActiveSidebarItemId, navigateFromSidebar } from '@/navigation/appSidebar'
import '../AppToolPage.scss'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function formatMoneyRu(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n)
}

export function PortfolioPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null)
  const [syncStatus, setSyncStatus] = useState<Record<string, unknown> | null>(null)
  const [syncBusy, setSyncBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [portRes, statusRes] = await Promise.all([
        PortfolioService.getPortfolioApiV1PortfolioGet(),
        PortfolioService.portfolioSyncStatusApiV1PortfolioSyncStatusGet().catch(() => null),
      ])
      const data = asRecord(portRes.data)
      setPayload(data)
      if (statusRes) {
        setSyncStatus(asRecord(statusRes.data))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить портфель')
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleSync = async () => {
    setSyncBusy(true)
    setError(null)
    try {
      await PortfolioService.realPortfolioSyncTriggerApiV1PortfolioRealSyncPost()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка синхронизации')
    } finally {
      setSyncBusy(false)
    }
  }

  const cash = payload?.cash
  const totalValue = payload?.totalValue ?? payload?.total_value
  const positionsValue = payload?.positionsValue ?? payload?.positions_value
  const positionsRaw = payload?.positions
  const positions = Array.isArray(positionsRaw) ? positionsRaw : []

  return (
    <PageLayout
      className="app-tool-page portfolio-page"
      header={
        <SurfaceCard className="app-tool-page__hero" tone="elevated">
          <Text as="p" variant="eyebrow" tone="muted">
            Брокерский контур
          </Text>
          <Text as="h1" variant="display">
            Портфель
          </Text>
          <Text as="p" variant="body" tone="muted">
            Данные реального счёта (Tinkoff). Обновление через синхронизацию с брокером.
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
          Обновить данные
        </Button>
        <Button variant="primary" loading={syncBusy} onClick={() => void handleSync()}>
          Синхронизировать с брокером
        </Button>
      </div>

      {error && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="p" variant="body" tone="danger">
            {error}
          </Text>
        </SurfaceCard>
      )}

      {syncStatus && Object.keys(syncStatus).length > 0 && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="h2" variant="title">
            Статус последней синхронизации
          </Text>
          <pre className="app-tool-page__json">{JSON.stringify(syncStatus, null, 2)}</pre>
        </SurfaceCard>
      )}

      {payload && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="h2" variant="title">
            Сводка
          </Text>
          <Text as="p" variant="body">
            Кэш: {formatMoneyRu(cash)}
          </Text>
          <Text as="p" variant="body">
            Стоимость позиций: {formatMoneyRu(positionsValue)}
          </Text>
          <Text as="p" variant="body">
            Итого: {formatMoneyRu(totalValue)}
          </Text>
        </SurfaceCard>
      )}

      <SurfaceCard className="app-tool-page__section">
        <Text as="h2" variant="title">
          Позиции
        </Text>
        {positions.length === 0 ? (
          <Text as="p" variant="body" tone="muted">
            {loading ? 'Загрузка...' : 'Нет позиций или данные недоступны.'}
          </Text>
        ) : (
          <table className="app-tool-page__table">
            <thead>
              <tr>
                <th>Тикер / FIGI</th>
                <th>Кол-во</th>
                <th>Средняя</th>
                <th>Текущая</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((raw, i) => {
                const p = asRecord(raw)
                const figi = String(p.figi ?? p.instrumentUid ?? '—')
                const ticker = String(p.ticker ?? p.symbol ?? '')
                const qty = p.quantity ?? p.qty ?? p.balance
                const avg = p.averagePositionPrice ?? p.averagePositionPriceFifo ?? p.avgPrice
                const cur = p.currentPrice ?? p.current_price
                return (
                  <tr key={`${figi}-${i}`}>
                    <td>
                      {ticker ? `${ticker} · ` : ''}
                      <span className="app-tool-page__mono">{figi}</span>
                    </td>
                    <td>{qty != null && qty !== '' ? String(qty) : '—'}</td>
                    <td>{formatMoneyRu(avg)}</td>
                    <td>{formatMoneyRu(cur)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </SurfaceCard>

      {payload && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="h2" variant="title">
            Сырой ответ API
          </Text>
          <pre className="app-tool-page__json">{JSON.stringify(payload, null, 2)}</pre>
        </SurfaceCard>
      )}
    </PageLayout>
  )
}
