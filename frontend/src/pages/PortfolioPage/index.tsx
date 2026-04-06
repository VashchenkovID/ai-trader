import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PortfolioService } from '@/api/generated/services/PortfolioService'
import { QuickTradeButton, type QuickTradeSource } from '@/components/trading/QuickTradeButton'
import { Button, PageLayout, Sidebar, SurfaceCard, Text } from '@/components/ui'
import { APP_SIDEBAR_ITEMS, getActiveSidebarItemId, navigateFromSidebar } from '@/navigation/appSidebar'
import '../AppToolPage.scss'

type PortfolioTab = 'virtual' | 'real'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function formatMoneyRu(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n)
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function buildVirtualPortfolioFallback(initialCapital: number): Record<string, unknown> {
  return {
    cash: initialCapital,
    positions: {},
    totalValue: initialCapital,
    positionsValue: 0,
    positionsList: [],
    isVirtual: true,
  }
}

async function fetchVirtualPortfolio(): Promise<Record<string, unknown>> {
  const response = await PortfolioService.getVirtualPortfolioApiV1PortfolioVirtualGet()
  return asRecord(response.data)
}

/** Таблица позиций: массив из API или нормализация словаря FIGI → qty (реальный таб). */
function normalizePositionsForTable(payload: Record<string, unknown> | null): unknown[] {
  if (!payload) return []
  const list = payload.positionsList
  if (Array.isArray(list)) return list
  const raw = payload.positions
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.entries(raw as Record<string, unknown>).map(([figi, quantity]) => ({
      figi,
      quantity,
    }))
  }
  return []
}

function extractFigisFromPositions(rows: unknown[]): string[] {
  const seen = new Set<string>()
  for (const raw of rows) {
    const p = asRecord(raw)
    const f = p.figi ?? p.instrumentUid
    if (f != null && String(f).trim() !== '') seen.add(String(f).trim())
  }
  return [...seen]
}

function recommendationLabelRu(rec: string | undefined): string {
  const u = String(rec ?? '').toUpperCase()
  if (u === 'BUY') return 'Докупать'
  if (u === 'SELL') return 'Продавать'
  if (u === 'HOLD') return 'Держать'
  return rec ? String(rec) : '—'
}

async function fetchRecommendationsMap(figis: string[]): Promise<Record<string, Record<string, unknown>>> {
  if (figis.length === 0) return {}
  const response = await PortfolioService.getPortfolioPositionRecommendationsApiV1PortfolioPositionRecommendationsGet({
    figi: figis,
  })
  const data = asRecord(response.data)
  const items = Array.isArray(data.items) ? data.items : []
  const map: Record<string, Record<string, unknown>> = {}
  for (const raw of items) {
    const row = asRecord(raw)
    const figi = String(row.figi ?? '')
    if (figi) map[figi] = row
  }
  return map
}

export function PortfolioPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState<PortfolioTab>('virtual')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [realPayload, setRealPayload] = useState<Record<string, unknown> | null>(null)
  const [virtualPayload, setVirtualPayload] = useState<Record<string, unknown> | null>(null)
  const [syncStatus, setSyncStatus] = useState<Record<string, unknown> | null>(null)
  const [syncBusy, setSyncBusy] = useState(false)
  const [recMapReal, setRecMapReal] = useState<Record<string, Record<string, unknown>>>({})
  const [recMapVirtual, setRecMapVirtual] = useState<Record<string, Record<string, unknown>>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [portRes, statusRes, virtual] = await Promise.all([
        PortfolioService.getPortfolioApiV1PortfolioGet().catch(() => null),
        PortfolioService.portfolioSyncStatusApiV1PortfolioSyncStatusGet().catch(() => null),
        fetchVirtualPortfolio().catch(() => null),
      ])
      const realData = portRes ? asRecord(portRes.data) : null
      setRealPayload(realData)
      setVirtualPayload(virtual ? asRecord(virtual) : buildVirtualPortfolioFallback(1_000_000))
      if (statusRes) {
        setSyncStatus(asRecord(statusRes.data))
      }

      const realPositions = normalizePositionsForTable(realData)
      const virtPositions = normalizePositionsForTable(virtual ? asRecord(virtual) : null)
      const [realRecs, virtRecs] = await Promise.all([
        fetchRecommendationsMap(extractFigisFromPositions(realPositions)).catch(() => ({})),
        fetchRecommendationsMap(extractFigisFromPositions(virtPositions)).catch(() => ({})),
      ])
      setRecMapReal(realRecs)
      setRecMapVirtual(virtRecs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить портфель')
      setRealPayload(null)
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

  const currentPayload = activeTab === 'virtual' ? virtualPayload : realPayload
  const cash = currentPayload?.cash
  const totalValue = currentPayload?.totalValue ?? currentPayload?.total_value
  const positionsValue = currentPayload?.positionsValue ?? currentPayload?.positions_value
  const positions = useMemo(
    () => normalizePositionsForTable(currentPayload),
    [currentPayload],
  )
  const recMap = activeTab === 'virtual' ? recMapVirtual : recMapReal

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
            Виртуальный (paper) и реальный (Tinkoff) портфель. По умолчанию открыт виртуальный.
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
        <Button
          variant={activeTab === 'virtual' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('virtual')}
        >
          Виртуальный
        </Button>
        <Button
          variant={activeTab === 'real' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('real')}
        >
          Реальный
        </Button>
        <Button variant="secondary" loading={loading} onClick={() => void load()}>
          Обновить данные
        </Button>
        {activeTab === 'real' && (
          <Button variant="primary" loading={syncBusy} onClick={() => void handleSync()}>
            Синхронизировать с брокером
          </Button>
        )}
      </div>

      {error && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="p" variant="body" tone="danger">
            {error}
          </Text>
        </SurfaceCard>
      )}

      {activeTab === 'real' && syncStatus && Object.keys(syncStatus).length > 0 && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="h2" variant="title">
            Статус последней синхронизации
          </Text>
          <pre className="app-tool-page__json">{JSON.stringify(syncStatus, null, 2)}</pre>
        </SurfaceCard>
      )}

      {currentPayload && (
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
        {activeTab === 'virtual' &&
          positions.some(raw => asRecord(raw).instrumentMissing === true) && (
            <Text as="p" variant="hint" tone="muted">
              Для части позиций нет строки в справочнике инструментов (например, синтетический FIGI из
              тестов). Тикер, средняя и текущая цена тогда берутся из истории сделок paper-счёта. В продакшене
              задайте{' '}
              <span className="app-tool-page__mono">ALLOW_SYNTHETIC_TRADING_FIGI=false</span> и используйте
              только реальные FIGI.
            </Text>
          )}
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
                <th>Рекомендация</th>
                <th>Средняя</th>
                <th>Текущая</th>
                {activeTab === 'virtual' ? <th>Δ</th> : null}
                <th>Действие</th>
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
                const avgN = toFiniteNumber(avg)
                const curN = toFiniteNumber(cur)
                const delta =
                  activeTab === 'virtual' && avgN != null && curN != null ? curN - avgN : null
                const instrumentMissing = p.instrumentMissing === true
                const recRow = figi !== '—' ? recMap[figi] : undefined
                const recRaw = recRow?.recommendation
                const recText =
                  typeof recRaw === 'string' ? recommendationLabelRu(recRaw) : '—'
                const conf = recRow?.confidence
                const confN = toFiniteNumber(recRow?.confidence) ?? 0.5
                const scrN = toFiniteNumber(recRow?.score) ?? 0.5
                let sellSource: QuickTradeSource | null = null
                if (figi !== '—') {
                  sellSource = recRow
                    ? { kind: 'recommendationFigi', figi }
                    : {
                        kind: 'recommendationData',
                        data: {
                          figi,
                          price: curN ?? avgN ?? 1,
                          recommendation: 'SELL',
                          confidence: confN,
                          score: scrN,
                          ...(ticker ? { ticker } : {}),
                        },
                      }
                }
                return (
                  <tr key={`${figi}-${i}`}>
                    <td>
                      {ticker ? `${ticker} · ` : ''}
                      <span className="app-tool-page__mono">{figi}</span>
                      {instrumentMissing && activeTab === 'virtual' ? (
                        <Text as="span" variant="hint" tone="muted" style={{ display: 'block', marginTop: '0.25rem' }}>
                          Нет в справочнике
                        </Text>
                      ) : null}
                    </td>
                    <td>{qty != null && qty !== '' ? String(qty) : '—'}</td>
                    <td>
                      {recText}
                      {conf != null && conf !== '' ? (
                        <span className="app-tool-page__mono" style={{ marginLeft: '0.35em' }}>
                          ({String(conf)})
                        </span>
                      ) : null}
                    </td>
                    <td>{formatMoneyRu(avg)}</td>
                    <td>{formatMoneyRu(cur)}</td>
                    {activeTab === 'virtual' ? (
                      <td>{delta != null && Number.isFinite(delta) ? formatMoneyRu(delta) : '—'}</td>
                    ) : null}
                    <td>
                      {sellSource ? (
                        <QuickTradeButton
                          intent="sell"
                          source={sellSource}
                          confidence={confN}
                          score={scrN}
                          mode={activeTab === 'virtual' ? 'paper' : 'real'}
                          portfolioTotalValue={toFiniteNumber(totalValue)}
                          onSuccess={() => void load()}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </SurfaceCard>

      {activeTab === 'real' && realPayload && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="h2" variant="title">
            Сырой ответ API
          </Text>
          <pre className="app-tool-page__json">{JSON.stringify(realPayload, null, 2)}</pre>
        </SurfaceCard>
      )}

      {activeTab === 'virtual' && virtualPayload && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="h2" variant="title">
            Сырой ответ (виртуальный портфель)
          </Text>
          <pre className="app-tool-page__json">{JSON.stringify(virtualPayload, null, 2)}</pre>
        </SurfaceCard>
      )}
    </PageLayout>
  )
}
