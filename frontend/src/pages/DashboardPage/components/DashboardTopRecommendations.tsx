import { Button, SurfaceCard, Text } from '@/components/ui'
import { labelRecommendation } from '@/utils/labels'
import { formatPercent01 } from '../formatters'
import type { DashboardRecommendation } from '../types'

type DashboardTopRecommendationsProps = {
  recommendations: DashboardRecommendation[]
  recommendationsTotal: number
  isLoading: boolean
  onOpenAll: () => void
  onOpenOne: (figi: string) => void
}

export function DashboardTopRecommendations({
  recommendations,
  recommendationsTotal,
  isLoading,
  onOpenAll,
  onOpenOne,
}: DashboardTopRecommendationsProps) {
  return (
    <SurfaceCard className="dashboard-page__section">
      <div className="dashboard-page__section-header">
        <Text as="h2" variant="title">
          Топ рекомендаций
        </Text>
        <Button variant="secondary" onClick={onOpenAll}>
          Все рекомендации
        </Button>
      </div>
      {recommendations.length === 0 && !isLoading ? (
        <Text as="p" variant="body" tone="muted">
          Нет рекомендаций для отображения.
        </Text>
      ) : (
        <ul className="dashboard-page__list">
          {recommendations.map(rec => (
            <li key={rec.id} className="dashboard-page__list-item">
              <button
                type="button"
                className="dashboard-page__link-button"
                onClick={() => onOpenOne(rec.figi)}
              >
                <Text as="p" variant="label">
                  {rec.name} ({rec.ticker})
                </Text>
                <Text as="p" variant="hint" tone="muted">
                  {rec.recommendation} · confidence: {formatPercent01(rec.confidence)} · score:{' '}
                  {rec.score == null ? '—' : rec.score.toFixed(2)}
                </Text>
                {rec.paperRecommendation != null && String(rec.paperRecommendation).trim() !== '' ? (
                  <Text as="p" variant="hint" tone="muted">
                    Paper: {labelRecommendation(rec.paperRecommendation)} · confidence:{' '}
                    {formatPercent01(rec.paperConfidence)} · score:{' '}
                    {rec.paperScore == null ? '—' : rec.paperScore.toFixed(2)}
                  </Text>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Text as="p" variant="hint" tone="muted">
        Всего рекомендаций: {recommendationsTotal}
      </Text>
    </SurfaceCard>
  )
}
