import { Input, Select, type SelectOption } from '@/components/ui'

export type TradingRequestStatusFilter =
  | 'all'
  | 'PENDING'
  | 'APPROVED'
  | 'EXECUTED'
  | 'REJECTED'
  | 'CANCELED'

export type TradingRequestModeFilter = 'all' | 'paper' | 'real' | 'micro'

export type TradingRequestsFiltersValue = {
  query: string
  status: TradingRequestStatusFilter
  mode: TradingRequestModeFilter
}

type TradingRequestsFiltersProps = {
  value: TradingRequestsFiltersValue
  onChange: (next: TradingRequestsFiltersValue) => void
}

const statusOptions: SelectOption[] = [
  { value: 'all', label: 'Все статусы' },
  { value: 'PENDING', label: 'PENDING' },
  { value: 'APPROVED', label: 'APPROVED' },
  { value: 'EXECUTED', label: 'EXECUTED' },
  { value: 'REJECTED', label: 'REJECTED' },
  { value: 'CANCELED', label: 'CANCELED' },
]

const modeOptions: SelectOption[] = [
  { value: 'all', label: 'Все режимы' },
  { value: 'paper', label: 'Бумажный (paper)' },
  { value: 'real', label: 'Реальный (real)' },
  { value: 'micro', label: 'Микро (micro)' },
]

export function TradingRequestsFilters({ value, onChange }: TradingRequestsFiltersProps) {
  return (
    <div className="trading-requests-page__filters">
      <Input
        label="Поиск (тикер / FIGI / ID заявки)"
        value={value.query}
        onChange={event => onChange({ ...value, query: event.target.value })}
        placeholder="Например, SBER или BBG004730N88"
      />
      <Select
        label="Статус"
        value={value.status}
        options={statusOptions}
        onChange={event =>
          onChange({
            ...value,
            status: event.target.value as TradingRequestsFiltersValue['status'],
          })
        }
      />
      <Select
        label="Режим"
        value={value.mode}
        options={modeOptions}
        onChange={event =>
          onChange({
            ...value,
            mode: event.target.value as TradingRequestsFiltersValue['mode'],
          })
        }
      />
    </div>
  )
}
