import { Box, Typography } from '@mui/material'
import { ColorType, createChart } from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import type { Time, UTCTimestamp } from 'lightweight-charts'

export type CandleRow = {
  time: unknown
  open: unknown
  high: unknown
  low: unknown
  close: unknown
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

export function CandlesChart({
  candles,
  emptyLabel,
}: {
  candles: CandleRow[]
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
      height: 340,
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)' },
    })

    const series = chart.addCandlestickSeries({
      upColor: '#00e5ff',
      downColor: '#ff007a',
      borderVisible: false,
      wickUpColor: '#00e5ff',
      wickDownColor: '#ff007a',
    })

    const data = candles.map(c => ({
      time: toChartTime(c.time),
      open: toNum(c.open),
      high: toNum(c.high),
      low: toNum(c.low),
      close: toNum(c.close),
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
  }, [candles])

  if (candles.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">{emptyLabel ?? 'Нет свечей для графика.'}</Typography>
      </Box>
    )
  }

  return <Box ref={hostRef} sx={{ width: '100%', minHeight: 340 }} />
}
