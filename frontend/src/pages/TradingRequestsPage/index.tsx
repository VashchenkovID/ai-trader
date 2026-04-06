import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { TradingRequestsService } from '@/api/generated/services/TradingRequestsService'
import { Button, PageLayout, Sidebar, SurfaceCard, Text } from '@/components/ui'
import { APP_SIDEBAR_ITEMS, getActiveSidebarItemId, navigateFromSidebar } from '@/navigation/appSidebar'
import {
  TradingRequestActionDialog,
  type TradingRequestActionType,
} from './components/TradingRequestActionDialog'
import {
  TradingRequestsFilters,
  type TradingRequestsFiltersValue,
} from './components/TradingRequestsFilters'
import { TradingRequestsStats, type TradingRequestsStatsData } from './components/TradingRequestsStats'
import { TradingRequestsTable, type TradingRequestRow } from './components/TradingRequestsTable'
import { cleanupCompletedTradingRequests } from '@/api/tradingRequestsExtras'
import './TradingRequestsPage.scss'

const PAGE_LIMIT = 20

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function asText(value: unknown, fallback = '—'): string {
  if (value == null) return fallback
  const text = String(value).trim()
  return text === '' ? fallback : text
}

function formatRuDateTime(raw: unknown): string {
  if (raw == null) return ''
  const source = String(raw).trim()
  if (!source) return ''
  const date = new Date(source)
  if (Number.isNaN(date.getTime())) return source
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function calculateAmount(row: Record<string, unknown>, quantity: number | null, price: number | null): number | null {
  const amountFromApi = asNumber(row.amount ?? row.budget)
  if (amountFromApi != null) return amountFromApi
  if (quantity == null || price == null) return null
  return quantity * price
}

function normalizeRow(raw: unknown): TradingRequestRow {
  const row = asRecord(raw)
  const recommendation = asRecord(row.recommendation)
  const quantity = asNumber(row.quantity)
  const price = asNumber(row.price)
  return {
    requestId: asText(row.requestId ?? row.id, ''),
    ticker: asText(row.ticker ?? recommendation.ticker, '—'),
    figi: asText(row.figi ?? recommendation.figi, '—'),
    action: asText(row.action ?? recommendation.recommendation, '—'),
    quantity,
    price,
    amount: calculateAmount(row, quantity, price),
    status: asText(row.status, 'НЕИЗВЕСТНО'),
    mode: asText(row.mode, '—'),
    createdAt: formatRuDateTime(row.createdAt),
    updatedAt: formatRuDateTime(row.updatedAt),
    comment: row.comment != null ? String(row.comment) : null,
    reason: row.reason != null ? String(row.reason) : null,
  }
}

function calculateStats(rows: TradingRequestRow[]): TradingRequestsStatsData {
  const stats: TradingRequestsStatsData = {
    pending: 0,
    approved: 0,
    executed: 0,
    rejected: 0,
    canceled: 0,
    total: rows.length,
  }
  for (const row of rows) {
    const status = row.status.trim().toUpperCase()
    if (status === 'PENDING') stats.pending += 1
    else if (status === 'APPROVED') stats.approved += 1
    else if (status === 'EXECUTED') stats.executed += 1
    else if (status === 'REJECTED') stats.rejected += 1
    else if (status === 'CANCELED' || status === 'CANCELLED') stats.canceled += 1
  }
  return stats
}

function normalizeStats(raw: unknown, fallbackRows: TradingRequestRow[]): TradingRequestsStatsData {
  const fallback = calculateStats(fallbackRows)
  const data = asRecord(raw)
  const byStatus = asRecord(data.byStatus)
  const fromByStatus: TradingRequestsStatsData = {
    pending: asNumber(byStatus.PENDING) ?? 0,
    approved: asNumber(byStatus.APPROVED) ?? 0,
    executed: asNumber(byStatus.EXECUTED) ?? 0,
    rejected: asNumber(byStatus.REJECTED) ?? 0,
    canceled: asNumber(byStatus.CANCELED ?? byStatus.CANCELLED) ?? 0,
    total: asNumber(data.total) ?? 0,
  }
  const hasServerStats =
    fromByStatus.total > 0 ||
    fromByStatus.pending > 0 ||
    fromByStatus.approved > 0 ||
    fromByStatus.executed > 0 ||
    fromByStatus.rejected > 0 ||
    fromByStatus.canceled > 0
  if (hasServerStats) return fromByStatus
  return {
    ...fallback,
    pending: asNumber(data.pending) ?? fallback.pending,
    approved: asNumber(data.approved) ?? fallback.approved,
    executed: asNumber(data.executed) ?? fallback.executed,
    rejected: asNumber(data.rejected) ?? fallback.rejected,
    canceled: asNumber(data.canceled) ?? fallback.canceled,
    total: asNumber(data.total) ?? fallback.total,
  }
}

export function TradingRequestsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<TradingRequestsStatsData>({
    pending: 0,
    approved: 0,
    executed: 0,
    rejected: 0,
    canceled: 0,
    total: 0,
  })
  const [items, setItems] = useState<TradingRequestRow[]>([])
  const [total, setTotal] = useState<number>(0)
  const [offset, setOffset] = useState(0)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const [dialogAction, setDialogAction] = useState<TradingRequestActionType | null>(null)
  const [dialogRequestId, setDialogRequestId] = useState<string | null>(null)
  const [cleanupBusy, setCleanupBusy] = useState(false)
  const initialFilters = useMemo<TradingRequestsFiltersValue>(
    () => ({
      query: searchParams.get('q') ?? '',
      status: (searchParams.get('status') as TradingRequestsFiltersValue['status']) || 'all',
      mode: (searchParams.get('mode') as TradingRequestsFiltersValue['mode']) || 'all',
    }),
    [searchParams]
  )
  const [filters, setFilters] = useState<TradingRequestsFiltersValue>(initialFilters)

  useEffect(() => {
    setFilters(initialFilters)
  }, [initialFilters])

  const activeSidebarItemId = getActiveSidebarItemId(location.pathname)

  const loadData = async (nextOffset = offset, nextFilters = filters) => {
    setLoading(true)
    setError(null)
    try {
      const [listRes, statsRes] = await Promise.all([
        TradingRequestsService.tradingRequestsListApiV1TradingRequestsGet({
          status: nextFilters.status === 'all' ? null : nextFilters.status,
          mode: nextFilters.mode === 'all' ? null : nextFilters.mode,
          offset: nextOffset,
          limit: PAGE_LIMIT,
        }),
        TradingRequestsService.tradingRequestsStatsApiV1TradingRequestsStatsGet({
          mode: nextFilters.mode === 'all' ? null : nextFilters.mode,
        }),
      ])
      const data = asRecord(listRes.data)
      const list = Array.isArray(data.items) ? data.items : []
      const meta = asRecord(data.meta)
      const normalizedItems = list.map(normalizeRow)
      setItems(normalizedItems)
      setTotal(asNumber(meta.total) ?? list.length)
      setStats(normalizeStats(statsRes.data, normalizedItems))
    } catch (loadErr) {
      const message = loadErr instanceof Error ? loadErr.message : 'Ошибка загрузки торговых заявок'
      setError(message)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData(offset, filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, filters.status, filters.mode])

  const filteredItems = useMemo(() => {
    const query = filters.query.trim().toLowerCase()
    if (!query) return items
    return items.filter(item => {
      const haystack = `${item.requestId} ${item.ticker} ${item.figi}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [items, filters.query])

  const quantityDiagnostics = useMemo(() => {
    if (items.length === 0) return null
    const withQty = items.filter(item => item.quantity != null)
    if (withQty.length === 0) return null
    const qtyOne = withQty.filter(item => item.quantity === 1).length
    const ratio = qtyOne / withQty.length
    if (ratio < 0.9) return null
    return {
      qtyOne,
      totalWithQty: withQty.length,
    }
  }, [items])

  const hasPrev = offset > 0
  const hasNext = offset + PAGE_LIMIT < total

  const syncSearchParams = (nextFilters: TradingRequestsFiltersValue) => {
    const params = new URLSearchParams(searchParams)
    if (nextFilters.query) params.set('q', nextFilters.query)
    else params.delete('q')
    if (nextFilters.status !== 'all') params.set('status', nextFilters.status)
    else params.delete('status')
    if (nextFilters.mode !== 'all') params.set('mode', nextFilters.mode)
    else params.delete('mode')
    setSearchParams(params, { replace: true })
  }

  const handleAction = (actionType: TradingRequestActionType, requestId: string) => {
    setDialogAction(actionType)
    setDialogRequestId(requestId)
  }

  const executeAction = async (payload: Record<string, unknown> | null) => {
    if (!dialogAction || !dialogRequestId) return
    setActionBusyId(dialogRequestId)
    setError(null)
    try {
      if (dialogAction === 'approve') {
        await TradingRequestsService.tradingRequestApproveApiV1TradingRequestsRequestIdApprovePost({
          requestId: dialogRequestId,
          requestBody: (payload ?? undefined) as never,
        })
      } else if (dialogAction === 'reject') {
        await TradingRequestsService.tradingRequestRejectApiV1TradingRequestsRequestIdRejectPost({
          requestId: dialogRequestId,
          requestBody: (payload ?? undefined) as never,
        })
      } else if (dialogAction === 'execute') {
        await TradingRequestsService.tradingRequestExecuteApiV1TradingRequestsRequestIdExecutePost({
          requestId: dialogRequestId,
          requestBody: (payload ?? undefined) as never,
        })
      } else {
        await TradingRequestsService.tradingRequestCancelApiV1TradingRequestsRequestIdCancelPost({
          requestId: dialogRequestId,
        })
      }
      await loadData(offset, filters)
      setDialogAction(null)
      setDialogRequestId(null)
    } catch (actionErr) {
      const message = actionErr instanceof Error ? actionErr.message : 'Ошибка выполнения действия по заявке'
      setError(message)
    } finally {
      setActionBusyId(null)
    }
  }

  const handleSidebarSelect = (itemId: string) => {
    navigateFromSidebar(navigate, itemId)
  }

  const handleCleanupCompleted = async () => {
    if (cleanupBusy) return
    const ok = window.confirm('Удалить все завершенные заявки (все, кроме "Ожидает")?')
    if (!ok) return
    setCleanupBusy(true)
    setError(null)
    try {
      const modeParam = filters.mode === 'all' ? null : filters.mode
      await cleanupCompletedTradingRequests(modeParam)
      setOffset(0)
      await loadData(0, filters)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка очистки завершенных заявок'
      setError(message)
    } finally {
      setCleanupBusy(false)
    }
  }

  return (
    <PageLayout
      className="trading-requests-page"
      header={
        <SurfaceCard className="trading-requests-page__hero" tone="elevated">
          <Text as="p" variant="eyebrow" tone="muted">
            Исполнение
          </Text>
          <Text as="h1" variant="display">
            Торговые заявки
          </Text>
          <Text as="p" variant="body" tone="muted">
            Операционный контур заявок: фильтрация, одобрение, отклонение, исполнение и отмена.
          </Text>
        </SurfaceCard>
      }
      sidebar={
        <Sidebar
          title="Навигация"
          items={APP_SIDEBAR_ITEMS}
          activeItemId={activeSidebarItemId}
          onSelect={handleSidebarSelect}
        />
      }
    >
      <TradingRequestsStats stats={stats} />

      <SurfaceCard className="trading-requests-page__section">
        <div className="trading-requests-page__section-header">
          <TradingRequestsFilters
            value={filters}
            onChange={next => {
              setOffset(0)
              setFilters(next)
              syncSearchParams(next)
            }}
          />
          <Button variant="secondary" loading={loading} onClick={() => void loadData(offset, filters)}>
            Обновить
          </Button>
          <Button
            variant="danger"
            loading={cleanupBusy}
            disabled={loading || cleanupBusy}
            onClick={() => void handleCleanupCompleted()}
          >
            Очистить завершенные
          </Button>
        </div>
      </SurfaceCard>

      {!loading && error && (
        <SurfaceCard className="trading-requests-page__state">
          <Text as="p" variant="body" tone="danger">
            {error}
          </Text>
          <Button variant="secondary" onClick={() => void loadData(offset, filters)}>
            Повторить
          </Button>
        </SurfaceCard>
      )}

      {loading && (
        <SurfaceCard className="trading-requests-page__state">
          <Text as="p" variant="body" tone="muted">
            Загрузка заявок...
          </Text>
        </SurfaceCard>
      )}

      {!loading && !error && filteredItems.length === 0 && (
        <SurfaceCard className="trading-requests-page__state">
          <Text as="p" variant="body" tone="muted">
            Заявки не найдены.
          </Text>
        </SurfaceCard>
      )}

      {!loading && !error && filteredItems.length > 0 && (
        <>
          {quantityDiagnostics && (
            <SurfaceCard className="trading-requests-page__state">
              <Text as="p" variant="hint" tone="danger">
                Почти все заявки имеют количество 1 ({quantityDiagnostics.qtyOne} из{' '}
                {quantityDiagnostics.totalWithQty}). Возможна проблема серверного расчета объема
                автоторговли.
              </Text>
            </SurfaceCard>
          )}
          <TradingRequestsTable
            rows={filteredItems}
            busyRequestId={actionBusyId}
            onApprove={requestId => handleAction('approve', requestId)}
            onReject={requestId => handleAction('reject', requestId)}
            onExecute={requestId => handleAction('execute', requestId)}
            onCancel={requestId => handleAction('cancel', requestId)}
          />
        </>
      )}

      <SurfaceCard className="trading-requests-page__pagination">
        <Button
          variant="secondary"
          disabled={!hasPrev}
          onClick={() => setOffset(prev => Math.max(0, prev - PAGE_LIMIT))}
        >
          Назад
        </Button>
        <Text as="span" variant="body" tone="muted">
          Страница {Math.floor(offset / PAGE_LIMIT) + 1}
          {total > 0 ? ` из ${Math.max(1, Math.ceil(total / PAGE_LIMIT))}` : ''}
        </Text>
        <Button variant="secondary" disabled={!hasNext} onClick={() => setOffset(prev => prev + PAGE_LIMIT)}>
          Вперед
        </Button>
      </SurfaceCard>

      <TradingRequestActionDialog
        actionType={dialogAction}
        requestId={dialogRequestId}
        busy={actionBusyId === dialogRequestId}
        onClose={() => {
          if (actionBusyId) return
          setDialogAction(null)
          setDialogRequestId(null)
        }}
        onConfirm={payload => void executeAction(payload)}
      />
    </PageLayout>
  )
}

