import { Box, Typography } from '@mui/material'
import { ColorType, createChart } from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import type { Time, UTCTimestamp } from 'lightweight-charts'

export type CandleWithVolume = {
  time: unknown
  open?: unknown
  close?: unknown
  volume?: unknown
}

function toChartTime(t: unknown): Time {
  if (t == null) return 0 as UTCTimestamp
  if (typeof t === 'number' && Number.isFinite(t)) return t as UTCTimestamp
  const s = String(t)
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) {
    return Math.floor(d.getTime() / 1000) as UTCTimestamp
  }
  const day = s.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day
  return 0 as UTCTimestamp
}

function toNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

type HistogramApi = {
  setData: (data: { time: Time; value: number; color?: string }[]) => void
  priceScale: () => { applyOptions: (o: { scaleMargins?: { top: number; bottom: number } }) => void }
}

type ChartWithHistogram = ReturnType<typeof createChart> & {
  addHistogramSeries?: (options: Record<string, unknown>) => HistogramApi
}

/**
 * Гистограмма объёма торгов по тем же таймстампам, что и свечи (данные из БД).
 */
export function VolumeHistogramChart({
  candles,
  emptyLabel,
}: {
  candles: CandleWithVolume[]
  emptyLabel?: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = hostRef.current
    if (!el || candles.length === 0) return

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
      height: 220,
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)' },
    })

    const raw = chart as ChartWithHistogram
    const addHistogram = raw.addHistogramSeries
    if (typeof addHistogram !== 'function') {
      chart.remove()
      return
    }

    const series = addHistogram.call(raw, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    })

    const data = candles.map(c => {
      const open = toNum(c.open)
      const close = toNum(c.close)
      const up = close >= open
      return {
        time: toChartTime(c.time),
        value: toNum(c.volume),
        color: up ? 'rgba(0, 229, 255, 0.55)' : 'rgba(255, 0, 122, 0.55)',
      }
    })

    series.setData(data)
    series.priceScale().applyOptions({
      scaleMargins: { top: 0.15, bottom: 0 },
    })

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
  }, [candles])

  const hasVolume = candles.some(c => toNum(c.volume) > 0)

  if (candles.length === 0 || !hasVolume) {
    return (
      <Box sx={{ py: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">
          {emptyLabel ?? 'Нет данных об объёме в свечах.'}
        </Typography>
      </Box>
    )
  }

  return <Box ref={hostRef} sx={{ width: '100%', minHeight: 220 }} />
}
