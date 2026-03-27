import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MarketService } from '@/api/generated/services/MarketService'
import { Button, PageLayout, Sidebar, SurfaceCard, Text } from '@/components/ui'
import { APP_SIDEBAR_ITEMS, getActiveSidebarItemId, navigateFromSidebar } from '@/navigation/appSidebar'
import { RecommendationCard, type RecommendationCardItem } from './components/RecommendationCard'
import {
  RecommendationFilters,
  type RecommendationFiltersValue,
} from './components/RecommendationFilters'
import { RecommendationEmptyState } from './components/RecommendationEmptyState'
import { RecommendationSkeleton } from './components/RecommendationSkeleton'
import { asNumber, asRecord, safeRecommendationsPayload } from './recommendationPayload'
import './RecommendationsPage.scss'

const PAGE_LIMIT = 20

const initialFilters: RecommendationFiltersValue = {
  query: '',
  side: 'all',
  fusionMode: 'all',
  minConfidence: '',
  sortBy: 'date_desc',
  momentumHorizon: 'all',
  momentumDirection: 'all',
}

export function RecommendationsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [total, setTotal] = useState<number | null>(null)
  const [items, setItems] = useState<RecommendationCardItem[]>([])
  const [filters, setFilters] = useState<RecommendationFiltersValue>(initialFilters)
  const activeSidebarItemId = getActiveSidebarItemId(location.pathname)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await MarketService.marketRecommendationsApiV1MarketRecommendationsGet({
          offset,
          limit: PAGE_LIMIT,
        })
        if (!active) return
        setItems(safeRecommendationsPayload(response.data))
        const meta = asRecord(asRecord(response.data).meta)
        setTotal(asNumber(meta.total))
      } catch (fetchError) {
        if (!active) return
        const message =
          fetchError instanceof Error ? fetchError.message : 'Не удалось загрузить рекомендации'
        setError(message)
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [offset, reloadNonce])

  const filteredItems = useMemo(() => {
    const query = filters.query.trim().toLowerCase()
    const minConfidence = asNumber(filters.minConfidence)
    const result = items.filter(item => {
      const searchHaystack = `${item.ticker} ${item.figi} ${item.name ?? ''}`.toLowerCase()
      if (query && !searchHaystack.includes(query)) return false
      if (filters.side !== 'all' && item.recommendation !== filters.side) return false
      if (filters.fusionMode !== 'all' && item.fusionMode !== filters.fusionMode) return false
      if (minConfidence != null && (item.confidence == null || item.confidence < minConfidence))
        return false
      if (filters.momentumHorizon !== 'all') {
        const point = item.horizonMomentum.find(h => h.id === filters.momentumHorizon)
        if (!point) return false
        if (filters.momentumDirection === 'positive' && !(point.returnPct > 0)) return false
        if (filters.momentumDirection === 'negative' && !(point.returnPct < 0)) return false
      }
      return true
    })

    result.sort((a, b) => {
      if (filters.sortBy === 'confidence_desc') return (b.confidence ?? -1) - (a.confidence ?? -1)
      if (filters.sortBy === 'score_desc') return (b.score ?? -1) - (a.score ?? -1)
      return (Date.parse(b.analysisDate ?? '') || 0) - (Date.parse(a.analysisDate ?? '') || 0)
    })
    return result
  }, [filters, items])

  const handleSidebarSelect = (itemId: string) => {
    navigateFromSidebar(navigate, itemId)
  }

  const hasPrev = offset > 0
  const hasNext = total == null ? items.length >= PAGE_LIMIT : offset + PAGE_LIMIT < total

  return (
    <PageLayout
      className="recommendations-page"
      header={
        <SurfaceCard className="recommendations-page__hero" tone="elevated">
          <Text as="p" variant="eyebrow" tone="muted">
            Аналитика
          </Text>
          <Text as="h1" variant="display">
            Рекомендации
          </Text>
          <Text as="p" variant="body" tone="muted">
            Read-only список рекомендаций с фильтрами и деталями расчета.
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
      <SurfaceCard>
        <RecommendationFilters value={filters} onChange={setFilters} />
      </SurfaceCard>

      {loading && <RecommendationSkeleton count={6} />}

      {!loading && error && (
        <SurfaceCard className="recommendations-page__state-card">
          <RecommendationEmptyState title="Ошибка загрузки" description={error} />
          <div className="recommendations-page__retry">
            <Button onClick={() => setReloadNonce(prev => prev + 1)}>Повторить</Button>
          </div>
        </SurfaceCard>
      )}

      {!loading && !error && filteredItems.length === 0 && <RecommendationEmptyState />}

      {!loading && !error && filteredItems.length > 0 && (
        <div className="recommendations-page__list">
          {filteredItems.map(item => (
            <div
              key={item.id}
              className="recommendations-page__card-wrap"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/recommendations/${encodeURIComponent(item.figi)}`)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  navigate(`/recommendations/${encodeURIComponent(item.figi)}`)
                }
              }}
            >
              <RecommendationCard item={item} />
            </div>
          ))}
        </div>
      )}

      <SurfaceCard className="recommendations-page__pagination">
        <Button
          variant="secondary"
          disabled={!hasPrev}
          onClick={() => setOffset(prev => Math.max(0, prev - PAGE_LIMIT))}
        >
          Назад
        </Button>
        <Text as="span" variant="body" tone="muted">
          Страница {Math.floor(offset / PAGE_LIMIT) + 1}
          {total != null ? ` из ${Math.max(1, Math.ceil(total / PAGE_LIMIT))}` : ''}
        </Text>
        <Button
          variant="secondary"
          disabled={!hasNext}
          onClick={() => setOffset(prev => prev + PAGE_LIMIT)}
        >
          Вперед
        </Button>
      </SurfaceCard>
    </PageLayout>
  )
}
