import { Box, Typography } from '@mui/material'
import { ColorType, createChart } from 'lightweight-charts'
import { useEffect, useMemo, useRef } from 'react'
import type { Time, UTCTimestamp } from 'lightweight-charts'

function toChartTime(day: string): Time {
  const d = new Date(`${day}T12:00:00Z`)
  if (!Number.isNaN(d.getTime())) {
    return Math.floor(d.getTime() / 1000) as UTCTimestamp
  }
  return 0 as UTCTimestamp
}

/** Ответ API по недельному прогнозу (форма может отличаться). */
export type WeeklyForecastPayload = unknown

/**
 * Строит ряд точек для графика: якорь — последнее закрытие, далее шаги прогноза.
 * Если значения похожи на доходности (малые), накапливаем от lastClose.
 */
export function weeklyForecastToLinePoints(payload: WeeklyForecastPayload): { time: string; value: number }[] {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) return []
  const o = payload as Record<string, unknown>
  if (o.ok !== true) return []
  const raw = o.forecastRaw
  if (!Array.isArray(raw) || raw.length === 0) return []
  const nums = raw
    .map(x => (typeof x === 'number' && Number.isFinite(x) ? x : Number(x)))
    .filter((n): n is number => Number.isFinite(n))
  if (nums.length === 0) return []

  const lastClose =
    typeof o.lastClose === 'number' && Number.isFinite(o.lastClose) && o.lastClose > 0 ? o.lastClose : null

  const maxAbs = Math.max(...nums.map(Math.abs))
  let values: number[]

  if (lastClose != null && maxAbs <= 0.35) {
    let p = lastClose
    values = [p]
    for (const r of nums) {
      p *= 1 + r
      values.push(p)
    }
  } else if (lastClose != null) {
    values = [lastClose, ...nums]
  } else {
    values = [...nums]
  }

  const base = new Date()
  base.setUTCHours(12, 0, 0, 0)
  return values.map((v, i) => {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + i)
    return { time: d.toISOString().slice(0, 10), value: v }
  })
}

export function weeklyForecastMeanCaption(payload: WeeklyForecastPayload): string | null {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) return null
  const o = payload as Record<string, unknown>
  if (o.ok !== true) return null
  const mf = o.meanForecast
  if (typeof mf !== 'number' || !Number.isFinite(mf)) return null
  const raw = o.forecastRaw
  const nums = Array.isArray(raw)
    ? raw
        .map(x => (typeof x === 'number' && Number.isFinite(x) ? x : Number(x)))
        .filter((n): n is number => Number.isFinite(n))
    : []
  const maxAbs = nums.length > 0 ? Math.max(...nums.map(Math.abs)) : 0
  const asReturns = maxAbs <= 0.35 || Math.abs(mf) <= 0.35
  const meanStr = asReturns ? `${(mf * 100).toFixed(2)}%` : mf.toFixed(4)
  const n = o.nForecast
  const steps =
    typeof n === 'number' && Number.isFinite(n) && n > 0 ? ` (${Math.round(n)} шагов)` : ''
  return `Среднее по шагам прогноза${steps}: ${meanStr}`
}

export function weeklyForecastStatusMessage(payload: WeeklyForecastPayload): string | null {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) return null
  const o = payload as Record<string, unknown>
  if (o.ok === true) return null
  const reason = o.reason != null ? String(o.reason) : ''
  const map: Record<string, string> = {
    insufficient_candles: 'Недостаточно свечей для прогноза',
    no_compatible_checkpoint: 'Нет подходящей модели недельного прогноза',
    no_weekly_checkpoint_dir: 'Каталог модели не найден',
    deps_unavailable: 'Модули прогноза недоступны',
  }
  return map[reason] ?? (reason ? `Прогноз недоступен (${reason})` : 'Прогноз недоступен')
}

export function WeeklyForecastChart({
  payload,
  emptyLabel,
}: {
  payload: WeeklyForecastPayload
  emptyLabel?: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const points = useMemo(() => weeklyForecastToLinePoints(payload), [payload])

  useEffect(() => {
    const el = hostRef.current
    if (!el || points.length === 0) return

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: '#12161c' },
        textColor: 'rgba(255,255,255,0.72)',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.06)' },
        horzLines: { color: 'rgba(255,255,255,0.06)' },
      },
      width: el.clientWidth,
      height: 280,
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)' },
    })

    const series = chart.addLineSeries({
      color: '#b388ff',
      lineWidth: 2,
    })

    const data = points.map(p => ({
      time: toChartTime(p.time),
      value: p.value,
    }))
    series.setData(data)
    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (!hostRef.current) return
      chart.applyOptions({ width: hostRef.current.clientWidth })
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.remove()
    }
  }, [points])

  if (points.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">{emptyLabel ?? 'Нет данных для графика прогноза.'}</Typography>
      </Box>
    )
  }

  return <Box ref={hostRef} sx={{ width: '100%', minHeight: 280 }} />
}
