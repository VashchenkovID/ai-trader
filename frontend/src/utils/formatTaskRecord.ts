import type { TaskRecord } from '@/store/systemStatusStore'

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

export function formatTaskDuration(task: TaskRecord): string | null {
  const a = parseMs(task.startedAt)
  const b = parseMs(task.finishedAt)
  if (a == null || b == null) return null
  const sec = Math.max(0, Math.round((b - a) / 1000))
  if (sec < 60) return `${sec} с`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `${m} мин ${s} с` : `${m} мин`
}

const TASK_TYPE_LABELS: Record<string, string> = {
  full_db_sync_year: 'Полная загрузка данных (год)',
  cache_update: 'Обновление кеша',
  cache_full_update: 'Полное обновление кеша',
  analysis_market_portfolio: 'Анализ рынка и портфеля',
  analysis_portfolio_positions: 'Анализ позиций портфелей (вердикт)',
  portfolio_sync: 'Синхронизация портфеля',
  portfolio_real_sync: 'Синхронизация реального портфеля',
  tinkoff_portfolio_sync: 'Синхронизация Tinkoff',
}

export function formatTaskTypeLabel(taskType: string): string {
  return TASK_TYPE_LABELS[taskType] ?? taskType.replace(/_/g, ' ')
}

function scalarText(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'boolean') return v ? 'да' : 'нет'
  return null
}

/** Срез `timing` из `_set_task_status` планировщика. */
function formatTimingBrief(timing: Record<string, unknown>): string | null {
  const ms = timing.durationMs
  if (typeof ms === 'number' && Number.isFinite(ms) && ms >= 0) {
    if (ms < 1000) return `${Math.round(ms)} мс`
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)} с`
    const m = Math.floor(ms / 60_000)
    const s = Math.round((ms % 60_000) / 1000)
    return s > 0 ? `${m} мин ${s} с` : `${m} мин`
  }
  return null
}

/** Объект `progress`, мержится в `result` во время джоба. */
function formatProgressBrief(progress: Record<string, unknown>): string {
  const bits: string[] = []
  for (const k of ['message', 'phase', 'step', 'label', 'status', 'detail']) {
    const t = scalarText(progress[k])
    if (t) bits.push(t)
  }
  const pct = progress.percent ?? progress.pct ?? progress.percentDone
  if (typeof pct === 'number' && Number.isFinite(pct)) bits.push(`${pct}%`)
  const cur = progress.current
  const tot = progress.total
  if (typeof cur === 'number' && typeof tot === 'number') bits.push(`${cur}/${tot}`)
  if (bits.length > 0) return bits.slice(0, 4).join(' · ')
  try {
    const j = JSON.stringify(progress)
    return j.length > 140 ? `${j.slice(0, 137)}…` : j
  } catch {
    return '…'
  }
}

function formatResultEntry(key: string, val: unknown): string | null {
  if (val === null || val === undefined) return null
  if (key === 'timing' && typeof val === 'object' && !Array.isArray(val)) {
    const brief = formatTimingBrief(val as Record<string, unknown>)
    return brief ? `длительность ${brief}` : null
  }
  if (key === 'progress' && typeof val === 'object' && !Array.isArray(val)) {
    const inner = formatProgressBrief(val as Record<string, unknown>)
    return inner ? `прогресс: ${inner}` : null
  }
  if (typeof val === 'object') {
    if (Array.isArray(val)) {
      try {
        const j = JSON.stringify(val)
        return `${key}: ${j.length > 80 ? `${j.slice(0, 77)}…` : j}`
      } catch {
        return `${key}: [массив]`
      }
    }
    try {
      const j = JSON.stringify(val as Record<string, unknown>)
      return `${key}: ${j.length > 100 ? `${j.slice(0, 97)}…` : j}`
    } catch {
      return `${key}: {…}`
    }
  }
  const t = scalarText(val)
  return t ? `${key}: ${t}` : null
}

export function formatTaskResultSummary(result: Record<string, unknown> | null | undefined): string {
  if (!result || typeof result !== 'object') return ''
  if (typeof result.message === 'string' && result.message.trim()) {
    const msg = result.message.trim()
    const extra: string[] = []
    const t = result.timing
    if (t && typeof t === 'object' && !Array.isArray(t)) {
      const b = formatTimingBrief(t as Record<string, unknown>)
      if (b) extra.push(`длительность ${b}`)
    }
    const reason = scalarText(result.reason)
    if (reason) extra.push(`причина: ${reason}`)
    return extra.length ? `${msg} · ${extra.join(' · ')}` : msg
  }
  const parts: string[] = []
  const reason = scalarText(result.reason)
  if (reason) parts.push(`причина: ${reason}`)
  const err = scalarText(result.errorMessage)
  if (err) parts.push(`ошибка: ${err}`)

  for (const key of ['timing', 'progress']) {
    if (key in result) {
      const line = formatResultEntry(key, result[key])
      if (line) parts.push(line)
    }
  }

  for (const key of ['updated', 'inserted', 'rows', 'count', 'total', 'status', 'job', 'ok']) {
    if (key in result && result[key] != null) {
      const line = formatResultEntry(key, result[key])
      if (line) parts.push(line)
    }
  }

  if (parts.length > 0) return parts.slice(0, 6).join(' · ')

  const keys = Object.keys(result)
  const lines = keys
    .map(k => formatResultEntry(k, result[k]))
    .filter((x): x is string => Boolean(x))
  if (lines.length > 0) return lines.slice(0, 6).join(' · ')
  return keys.length > 0 ? `${keys.length} полей в результате` : ''
}

export function formatTaskWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('ru-RU')
  } catch {
    return iso
  }
}
