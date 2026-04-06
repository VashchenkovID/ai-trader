import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { MarketService } from '@/api/generated/services/MarketService'
import { NewsService } from '@/api/generated/services/NewsService'
import { Button, PageLayout, Sidebar, SurfaceCard, Text } from '@/components/ui'
import { APP_SIDEBAR_ITEMS, getActiveSidebarItemId, navigateFromSidebar } from '@/navigation/appSidebar'
import { RecommendationCard, type RecommendationCardItem } from '@/pages/RecommendationsPage/components/RecommendationCard'
import { asRecord, normalizeRecommendation } from '@/pages/RecommendationsPage/recommendationPayload'
import { useTradingCoreStore } from '@/store/tradingCoreStore'
import { CandlesVolumeChart, type CandleRow } from './components/CandlesVolumeChart'
import { WeeklyForecastChart } from './components/WeeklyForecastChart'
import './RecommendationDetailPage.scss'

function extractEnvelopeItems(response: unknown): unknown[] {
  const root = asRecord(response)
  const data = asRecord(root.data)
  const items = data.items
  return Array.isArray(items) ? items : []
}

export function RecommendationDetailPage() {
  const { figi: figiParam } = useParams<{ figi: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const figi = figiParam ? decodeURIComponent(figiParam) : ''

  const [loading, setLoading] = useState(true)
  const [recError, setRecError] = useState<string | null>(null)
  const [item, setItem] = useState<RecommendationCardItem | null>(null)
  const [candles, setCandles] = useState<CandleRow[]>([])
  const [weekly, setWeekly] = useState<Record<string, unknown> | null>(null)
  const [weeklyRefreshing, setWeeklyRefreshing] = useState(false)
  const [weeklyRefreshError, setWeeklyRefreshError] = useState<string | null>(null)
  const [signals, setSignals] = useState<Record<string, unknown>[]>([])
  const [news, setNews] = useState<Record<string, unknown>[]>([])

  const totalBalance = useTradingCoreStore(s => s.totalBalance)

  const refetchRecommendationOnly = useCallback(async () => {
    if (!figi) return
    try {
      const res = await MarketService.marketRecommendationByFigiApiV1MarketRecommendationsFigiGet({ figi })
      const env = asRecord(res)
      const payload = asRecord(env.data)
      setItem(normalizeRecommendation(payload))
    } catch {
      /* карточка остаётся без изменений */
    }
  }, [figi])

  useEffect(() => {
    if (!figi) return
    let active = true

    const load = async () => {
      setLoading(true)
      setRecError(null)

      let normalized: RecommendationCardItem | null = null
      try {
        const res = await MarketService.marketRecommendationByFigiApiV1MarketRecommendationsFigiGet({ figi })
        if (!active) return
        const env = asRecord(res)
        const payload = asRecord(env.data)
        normalized = normalizeRecommendation(payload)
        setItem(normalized)
      } catch {
        if (!active) return
        setRecError('Рекомендация не найдена или недоступна.')
        setItem(null)
      }

      const embedded = normalized?.weeklyForecast
      const hasEmbeddedWeekly =
        embedded != null && typeof embedded === 'object' && 'ok' in embedded

      const settled = await Promise.allSettled([
        MarketService.marketStockCandlesApiV1MarketStockFigiCandlesGet({ figi, limit: 365 }),
        hasEmbeddedWeekly
          ? Promise.resolve({ data: embedded } as { data: Record<string, unknown> })
          : MarketService.marketStockWeeklyForecastApiV1MarketStockFigiWeeklyForecastGet({
              figi,
              refresh: false,
            }),
        MarketService.marketStockAnalystSignalsApiV1MarketStockFigiAnalystSignalsGet({ figi }),
        NewsService.newsByFigiApiV1NewsFigiGet({ figi, limit: 20, days: 90 }),
      ])

      if (!active) return

      const [cRes, wRes, sRes, nRes] = settled

      if (cRes.status === 'fulfilled') {
        const rows = extractEnvelopeItems(cRes.value).map(x => asRecord(x))
        setCandles(
          rows.map(r => ({
            time: String(r.time ?? ''),
            open: Number(r.open ?? 0),
            high: Number(r.high ?? 0),
            low: Number(r.low ?? 0),
            close: Number(r.close ?? 0),
            volume: Number(r.volume ?? 0),
          })),
        )
      } else {
        setCandles([])
      }

      if (wRes.status === 'fulfilled') {
        const env = asRecord(wRes.value)
        setWeekly(asRecord(env.data))
      } else {
        setWeekly(null)
      }

      if (sRes.status === 'fulfilled') {
        const list = extractEnvelopeItems(sRes.value).map(x => asRecord(x))
        setSignals(list)
      } else {
        setSignals([])
      }

      if (nRes.status === 'fulfilled') {
        const list = extractEnvelopeItems(nRes.value).map(x => asRecord(x))
        setNews(list)
      } else {
        setNews([])
      }

      setLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [figi])

  const lastCandleTime = useMemo(
    () => (candles.length > 0 ? candles[candles.length - 1].time : ''),
    [candles],
  )

  const weeklyOk = weekly && weekly.ok === true
  const forecastRaw = weeklyOk && Array.isArray(weekly.forecastRaw) ? (weekly.forecastRaw as number[]) : []

  const handleRefreshWeeklyForecast = async () => {
    if (!figi || weeklyRefreshing) return
    setWeeklyRefreshing(true)
    setWeeklyRefreshError(null)
    try {
      const res = await MarketService.marketStockWeeklyForecastApiV1MarketStockFigiWeeklyForecastGet({
        figi,
        refresh: true,
      })
      const env = asRecord(res)
      setWeekly(asRecord(env.data))
      try {
        const recRes = await MarketService.marketRecommendationByFigiApiV1MarketRecommendationsFigiGet({ figi })
        const recEnv = asRecord(recRes)
        setItem(normalizeRecommendation(asRecord(recEnv.data)))
      } catch {
        /* карточка остаётся с прежними полями; график уже обновлён */
      }
    } catch {
      setWeeklyRefreshError('Не удалось пересчитать прогноз. Повторите позже.')
    } finally {
      setWeeklyRefreshing(false)
    }
  }

  const handleSidebarSelect = (itemId: string) => {
    navigateFromSidebar(navigate, itemId)
  }

  if (!figi) {
    return (
      <PageLayout className="recommendation-detail-page">
        <SurfaceCard>
          <Text as="p" variant="body">
            Не указан FIGI.
          </Text>
        </SurfaceCard>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      className="recommendation-detail-page"
      header={
        <SurfaceCard className="recommendation-detail-page__hero" tone="elevated">
          <div className="recommendation-detail-page__hero-row">
            <div>
              <Text as="p" variant="eyebrow" tone="muted">
                Рекомендация
              </Text>
              <Text as="h1" variant="display">
                {item?.name ?? item?.ticker ?? figi}
              </Text>
              <Text as="p" variant="body" tone="muted">
                FIGI: {figi}
              </Text>
            </div>
            <Button variant="secondary" onClick={() => navigate('/recommendations')}>
              К списку
            </Button>
          </div>
        </SurfaceCard>
      }
      sidebar={
        <Sidebar
          title="Навигация"
          items={APP_SIDEBAR_ITEMS}
          activeItemId={getActiveSidebarItemId(location.pathname)}
          onSelect={handleSidebarSelect}
        />
      }
    >
      {loading && (
        <SurfaceCard>
          <Text as="p" variant="body" tone="muted">
            Загрузка…
          </Text>
        </SurfaceCard>
      )}

      {!loading && recError && !item && (
        <SurfaceCard className="recommendation-detail-page__state">
          <Text as="p" variant="body">
            {recError}
          </Text>
        </SurfaceCard>
      )}

      {!loading && item && (
        <RecommendationCard
          item={item}
          portfolioTotalValue={totalBalance > 0 ? totalBalance : null}
          onTradeSuccess={() => void refetchRecommendationOnly()}
        />
      )}

      {!loading && (
        <>
          <SurfaceCard className="recommendation-detail-page__section">
            <Text as="h2" variant="title">
              Цена и объём
            </Text>
            <Text as="p" variant="hint" tone="muted">
              Дневные свечи из БД (история синхронизации рынка).
            </Text>
            {candles.length > 0 ? (
              <CandlesVolumeChart candles={candles} className="recommendation-detail-page__chart" />
            ) : (
              <Text as="p" variant="body" tone="muted">
                Нет свечей для графика. Запустите синхронизацию свечей (scheduler / market refresh).
              </Text>
            )}
          </SurfaceCard>

          <SurfaceCard className="recommendation-detail-page__section">
            <div className="recommendation-detail-page__section-header">
              <div className="recommendation-detail-page__section-header-text">
                <Text as="h2" variant="title">
                  Прогноз Weekly LSTM
                </Text>
                <Text as="p" variant="hint" tone="muted">
                  Сохранённый в БД прогноз; кнопка ниже пересчитывает модель и записывает результат (может занять время
                  из‑за холодного старта PyTorch).
                </Text>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={weeklyRefreshing}
                onClick={() => void handleRefreshWeeklyForecast()}
              >
                {weeklyRefreshing ? 'Пересчёт…' : 'Обновить прогноз'}
              </Button>
            </div>
            {weeklyRefreshError != null && (
              <Text as="p" variant="hint" tone="muted">
                {weeklyRefreshError}
              </Text>
            )}
            {weeklyOk && forecastRaw.length > 0 && lastCandleTime ? (
              <WeeklyForecastChart
                lastCandleTimeIso={lastCandleTime}
                forecastRaw={forecastRaw}
                className="recommendation-detail-page__chart"
              />
            ) : (
              <Text as="p" variant="body" tone="muted">
                {weekly && weekly.ok === false
                  ? `Прогноз недоступен: ${String(weekly.reason ?? 'unknown')}.`
                  : 'Нет данных прогноза.'}
              </Text>
            )}
          </SurfaceCard>

          <SurfaceCard className="recommendation-detail-page__section">
            <Text as="h2" variant="title">
              Сигналы аналитиков
            </Text>
            {signals.length === 0 ? (
              <Text as="p" variant="body" tone="muted">
                Нет сигналов в БД для этого инструмента. Обновите сигналы (scheduler signals_update).
              </Text>
            ) : (
              <ul className="recommendation-detail-page__list-plain">
                {signals.map((s, idx) => (
                  <li key={`${String(s.signalUid ?? idx)}-${idx}`}>
                    <Text as="span" variant="label">
                      {String(s.direction ?? '—')}
                    </Text>
                    {s.syncedAt != null && (
                      <Text as="span" variant="hint" tone="muted">
                        {' '}
                        · {String(s.syncedAt)}
                      </Text>
                    )}
                    <pre className="recommendation-detail-page__payload">
                      {JSON.stringify(s.payload, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </SurfaceCard>

          <SurfaceCard className="recommendation-detail-page__section">
            <Text as="h2" variant="title">
              Новости
            </Text>
            {news.length === 0 ? (
              <Text as="p" variant="body" tone="muted">
                Новостей по инструменту нет.
              </Text>
            ) : (
              <ul className="recommendation-detail-page__news">
                {news.map((n, idx) => (
                  <li key={String(n.id ?? idx)}>
                    <Text as="p" variant="label">
                      {String(n.title ?? '—')}
                    </Text>
                    <Text as="p" variant="hint" tone="muted">
                      {String(n.publishedAt ?? n.published_at ?? '')} · sentiment:{' '}
                      {String(n.sentiment ?? '—')}
                    </Text>
                    {n.summary != null && String(n.summary).trim() !== '' && (
                      <Text as="p" variant="body">
                        {String(n.summary)}
                      </Text>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SurfaceCard>
        </>
      )}
    </PageLayout>
  )
}
