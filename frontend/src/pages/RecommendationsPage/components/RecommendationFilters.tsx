import { Input, Select, type SelectOption } from '@/components/ui'

export type RecommendationFiltersValue = {
  query: string
  side: 'all' | 'BUY' | 'SELL' | 'HOLD'
  fusionMode: 'all' | 'NN' | 'LLM' | 'NN+LLM' | 'unknown'
  minConfidence: string
  sortBy: 'date_desc' | 'confidence_desc' | 'score_desc'
  /** Фильтр по фактической доходности за период (ret1/5/20 в признаках NN). */
  momentumHorizon: 'all' | '1d' | '5d' | '20d'
  momentumDirection: 'all' | 'positive' | 'negative'
}

type RecommendationFiltersProps = {
  value: RecommendationFiltersValue
  onChange: (next: RecommendationFiltersValue) => void
}

const sideOptions: SelectOption[] = [
  { value: 'all', label: 'Все сигналы' },
  { value: 'BUY', label: 'BUY' },
  { value: 'SELL', label: 'SELL' },
  { value: 'HOLD', label: 'HOLD' },
]

const fusionOptions: SelectOption[] = [
  { value: 'all', label: 'Все источники' },
  { value: 'NN', label: 'NN' },
  { value: 'LLM', label: 'LLM' },
  { value: 'NN+LLM', label: 'NN+LLM' },
  { value: 'unknown', label: 'Не указано' },
]

const sortOptions: SelectOption[] = [
  { value: 'date_desc', label: 'Сначала новые' },
  { value: 'confidence_desc', label: 'По confidence' },
  { value: 'score_desc', label: 'По score' },
]

const momentumHorizonOptions: SelectOption[] = [
  { value: 'all', label: 'Все горизонты' },
  { value: '1d', label: '1 день' },
  { value: '5d', label: '5 дней' },
  { value: '20d', label: '~20 дней' },
]

const momentumDirectionOptions: SelectOption[] = [
  { value: 'all', label: 'Любое направление' },
  { value: 'positive', label: 'Рост' },
  { value: 'negative', label: 'Падение' },
]

export function RecommendationFilters({ value, onChange }: RecommendationFiltersProps) {
  return (
    <div className="recommendations-page__filters">
      <Input
        label="Поиск (тикер / FIGI / название)"
        value={value.query}
        onChange={event => onChange({ ...value, query: event.target.value })}
        placeholder="Например, SBER"
      />

      <Select
        label="Сигнал"
        value={value.side}
        options={sideOptions}
        onChange={event =>
          onChange({ ...value, side: event.target.value as RecommendationFiltersValue['side'] })
        }
      />

      <Select
        label="Источник"
        value={value.fusionMode}
        options={fusionOptions}
        onChange={event =>
          onChange({
            ...value,
            fusionMode: event.target.value as RecommendationFiltersValue['fusionMode'],
          })
        }
      />

      <Input
        label="Мин. confidence (0..1)"
        type="number"
        min={0}
        max={1}
        step={0.01}
        value={value.minConfidence}
        onChange={event => onChange({ ...value, minConfidence: event.target.value })}
        placeholder="0.5"
      />

      <Select
        label="Динамика по горизонту"
        value={value.momentumHorizon}
        options={momentumHorizonOptions}
        onChange={event => {
          const momentumHorizon = event.target.value as RecommendationFiltersValue['momentumHorizon']
          onChange({
            ...value,
            momentumHorizon,
            momentumDirection: momentumHorizon === 'all' ? 'all' : value.momentumDirection,
          })
        }}
      />

      <Select
        label="Направление (для выбранного горизонта)"
        value={value.momentumDirection}
        options={momentumDirectionOptions}
        disabled={value.momentumHorizon === 'all'}
        onChange={event =>
          onChange({
            ...value,
            momentumDirection: event.target.value as RecommendationFiltersValue['momentumDirection'],
          })
        }
      />

      <Select
        label="Сортировка"
        value={value.sortBy}
        options={sortOptions}
        onChange={event =>
          onChange({ ...value, sortBy: event.target.value as RecommendationFiltersValue['sortBy'] })
        }
      />
    </div>
  )
}

