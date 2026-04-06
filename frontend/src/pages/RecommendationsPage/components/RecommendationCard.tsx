import { QuickTradeButton } from '@/components/trading/QuickTradeButton'
import { SurfaceCard, Text } from '@/components/ui'
import { labelRecommendation } from '@/utils/labels'

export type HorizonMomentumPoint = {
  id: '1d' | '5d' | '20d'
  label: string
  /** Доходность за период в процентах (факт по истории, признак модели). */
  returnPct: number
  kind: string
}

export type RecommendationCardItem = {
  id: string
  ticker: string
  name: string | null
  figi: string
  recommendation: 'BUY' | 'SELL' | 'HOLD' | 'UNKNOWN'
  score: number | null
  confidence: number | null
  currentPrice: number | null
  entryPrice: number | null
  stopLoss: number | null
  takeProfit: number | null
  riskReward: number | null
  horizon: string | null
  invalidationCondition: string | null
  planStatus: string | null
  fusionMode: string
  analysisDate: string | null
  reason: string | null
  llmReason: string | null
  skipReason: string | null
  explanation: string
  horizonMomentum: HorizonMomentumPoint[]
  /** Сохранённый weekly LSTM (после scheduler), опционально */
  weeklyForecast?: Record<string, unknown> | null
  weeklyForecastAt?: string | null
  details: Record<string, unknown>
}

type RecommendationCardProps = {
  item: RecommendationCardItem
  portfolioTotalValue?: number | null
  onTradeSuccess?: () => void
}

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${Math.round(value * 100)}%`
}

function formatReturnPct(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function formatNumber(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(3)
}

function planStatusLabel(value: string | null): string {
  if (!value) return '—'
  if (value === 'ready') return 'Готов'
  if (value === 'insufficient_data') return 'Недостаточно данных'
  return value
}

function horizonLabel(value: string | null): string {
  if (!value) return '—'
  if (value === '1w') return '1 неделя'
  if (value === '1d') return '1 день'
  if (value === '1m') return '1 месяц'
  return value
}

export function RecommendationCard({
  item,
  portfolioTotalValue,
  onTradeSuccess,
}: RecommendationCardProps) {
  return (
    <SurfaceCard className="recommendations-page__card">
      <div className="recommendations-page__card-header">
        <div>
          <Text as="h3" variant="title">
            {item.name ?? 'Без названия'}
          </Text>
          <Text as="p" variant="hint" tone="muted">
            Тикер: {item.ticker}
          </Text>
          <Text as="p" variant="hint" tone="muted">
            FIGI: {item.figi}
          </Text>
        </div>
        <span className={`recommendations-page__badge recommendations-page__badge--${item.recommendation}`}>
          {labelRecommendation(item.recommendation)}
        </span>
      </div>

      <div className="recommendations-page__trade-strip">
        <div className="recommendations-page__trade-price recommendations-page__trade-price--current">
          <Text as="p" variant="hint" tone="muted">
            Текущая цена
          </Text>
          <Text as="p" variant="label">
            {formatNumber(item.currentPrice)}
          </Text>
        </div>
        <div className="recommendations-page__trade-price recommendations-page__trade-price--stop">
          <Text as="p" variant="hint" tone="muted">
            Stop Loss
          </Text>
          <Text as="p" variant="label">
            {formatNumber(item.stopLoss)}
          </Text>
        </div>
        <div className="recommendations-page__trade-price recommendations-page__trade-price--take">
          <Text as="p" variant="hint" tone="muted">
            Take Profit
          </Text>
          <Text as="p" variant="label">
            {formatNumber(item.takeProfit)}
          </Text>
        </div>
      </div>

      <div className="recommendations-page__card-actions">
        {item.recommendation === 'BUY' && (
          <QuickTradeButton
            intent="buy"
            source={{ kind: 'recommendationFigi', figi: item.figi }}
            confidence={item.confidence ?? 0.5}
            score={item.score ?? 0.5}
            portfolioTotalValue={portfolioTotalValue}
            onSuccess={onTradeSuccess}
          />
        )}
        {item.recommendation === 'SELL' && (
          <QuickTradeButton
            intent="sell"
            source={{ kind: 'recommendationFigi', figi: item.figi }}
            confidence={item.confidence ?? 0.5}
            score={item.score ?? 0.5}
            portfolioTotalValue={portfolioTotalValue}
            onSuccess={onTradeSuccess}
          />
        )}
        {item.recommendation === 'HOLD' && (
          <>
            <QuickTradeButton
              intent="buy"
              source={{ kind: 'recommendationFigi', figi: item.figi }}
              confidence={item.confidence ?? 0.5}
              score={item.score ?? 0.5}
              portfolioTotalValue={portfolioTotalValue}
              onSuccess={onTradeSuccess}
            />
            <QuickTradeButton
              intent="sell"
              source={{ kind: 'recommendationFigi', figi: item.figi }}
              confidence={item.confidence ?? 0.5}
              score={item.score ?? 0.5}
              portfolioTotalValue={portfolioTotalValue}
              onSuccess={onTradeSuccess}
            />
          </>
        )}
        {item.recommendation === 'UNKNOWN' && (
          <Text as="p" variant="hint" tone="muted">
            Быстрая сделка недоступна: нет сигнала BUY/SELL/HOLD.
          </Text>
        )}
      </div>

      {item.horizonMomentum.length > 0 && (
        <div className="recommendations-page__horizon-block">
          <Text as="p" variant="label">
            Динамика по горизонтам
          </Text>
          <Text as="p" variant="hint" tone="muted">
            Фактическая доходность за период (признаки модели), не прогноз цены вперёд.
          </Text>
          <div className="recommendations-page__horizon-strip">
            {item.horizonMomentum.map(point => (
              <div key={point.id} className="recommendations-page__horizon-cell">
                <Text as="p" variant="hint" tone="muted">
                  {point.label}
                </Text>
                <Text
                  as="p"
                  variant="label"
                  className={
                    point.returnPct > 0
                      ? 'recommendations-page__horizon-value--up'
                      : point.returnPct < 0
                        ? 'recommendations-page__horizon-value--down'
                        : undefined
                  }
                >
                  {formatReturnPct(point.returnPct)}
                </Text>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="recommendations-page__metrics recommendations-page__metrics--compact">
        <Text as="p" variant="hint" tone="muted">
          Вход: <strong>{formatNumber(item.entryPrice)}</strong>
        </Text>
        <Text as="p" variant="hint" tone="muted">
          Риск/потенциал: <strong>{formatNumber(item.riskReward)}</strong>
        </Text>
        <Text as="p" variant="hint" tone="muted">
          Confidence: <strong>{formatPercent(item.confidence)}</strong>
        </Text>
        <Text as="p" variant="hint" tone="muted">
          Fusion: <strong>{item.fusionMode || '—'}</strong>
        </Text>
        <Text as="p" variant="hint" tone="muted">
          Анализ: <strong>{item.analysisDate ?? '—'}</strong>
        </Text>
        <Text as="p" variant="hint" tone="muted">
          Score: <strong>{formatNumber(item.score)}</strong>
        </Text>
      </div>

      <div className="recommendations-page__plan">
        <Text as="p" variant="label">
          Сценарий сделки
        </Text>
        <Text as="p" variant="hint" tone="muted">
          Статус плана: {planStatusLabel(item.planStatus)}
        </Text>
        <Text as="p" variant="hint" tone="muted">
          Горизонт: {horizonLabel(item.horizon)}
        </Text>
        <Text as="p" variant="hint" tone="muted">
          Условие отмены: {item.invalidationCondition ?? '—'}
        </Text>
      </div>

      <div className="recommendations-page__context">
        <Text as="p" variant="hint">
          Почему: {item.explanation}
        </Text>
      </div>

    </SurfaceCard>
  )
}

