import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AutoPaperTradingService } from '@/api/generated/services/AutoPaperTradingService'
import { Button, PageLayout, Sidebar, SurfaceCard, Text } from '@/components/ui'
import { APP_SIDEBAR_ITEMS, getActiveSidebarItemId, navigateFromSidebar } from '@/navigation/appSidebar'
import '../AppToolPage.scss'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function parseIsoDateOnly(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw).trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  return new Date(y, mo - 1, d)
}

function formatRuDate(raw: string): string {
  const dt = parseIsoDateOnly(raw)
  if (!dt) return raw
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dt)
}

function pickStatsFields(stats: Record<string, unknown>) {
  const start =
    (stats.startDate as string | undefined) ?? (stats.start_date as string | undefined) ?? ''
  const end = (stats.endDate as string | undefined) ?? (stats.end_date as string | undefined) ?? ''
  const rawCount = stats.executedCount ?? stats.executed_count ?? stats.requestsTotal
  const executed =
    typeof rawCount === 'number' && Number.isFinite(rawCount)
      ? rawCount
      : typeof rawCount === 'string'
        ? Number.parseInt(rawCount, 10)
        : NaN
  return {
    start,
    end,
    executedCount: Number.isFinite(executed) ? executed : null,
  }
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
  const statsFields = stats ? pickStatsFields(stats) : null

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

      {stats && statsFields && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="h2" variant="title">
            Статистика
          </Text>
          {statsFields.start && statsFields.end ? (
            <Text as="p" variant="body">
              Период учёта:{' '}
              <strong>
                {formatRuDate(statsFields.start)} — {formatRuDate(statsFields.end)}
              </strong>
            </Text>
          ) : null}
          <Text as="p" variant="body">
            Исполнено заявок (paper, статус «Исполнена»):{' '}
            <strong>{statsFields.executedCount != null ? statsFields.executedCount : '—'}</strong>
          </Text>
          <Text as="p" variant="hint" tone="muted">
            Счётчик по всем исполненным заявкам в режиме paper; период задаётся на сервере (по умолчанию
            последние 30 дней).
          </Text>
        </SurfaceCard>
      )}
    </PageLayout>
  )
}
