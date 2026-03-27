export function formatMoney(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatPercent01(value: number | null): string {
  if (value == null) return '—'
  return `${Math.round(value * 100)}%`
}

export function formatAgo(raw: string | null): string {
  if (!raw) return '—'
  const dt = new Date(raw)
  if (Number.isNaN(dt.getTime())) return raw
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt)
}
