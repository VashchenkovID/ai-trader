import { Box, Typography } from '@mui/material'
import { ColorType, createChart } from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import type { Time, UTCTimestamp } from 'lightweight-charts'

export type NavPoint = {
  date: string
  totalValue: number
}

function toChartTime(t: string): Time {
  const d = new Date(t)
  if (!Number.isNaN(d.getTime())) {
    return Math.floor(d.getTime() / 1000) as UTCTimestamp
  }
  const day = t.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day
  return 0 as UTCTimestamp
}

export function NavLineChart({
  points,
  emptyLabel,
}: {
  points: NavPoint[]
  emptyLabel?: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)

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
      height: 320,
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)' },
    })

    const series = chart.addLineSeries({
      color: '#00e5ff',
      lineWidth: 2,
    })

    const data = points.map(p => ({
      time: toChartTime(p.date),
      value: Number.isFinite(p.totalValue) ? p.totalValue : 0,
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
        <Typography color="text.secondary">{emptyLabel ?? 'Нет точек NAV.'}</Typography>
      </Box>
    )
  }

  return <Box ref={hostRef} sx={{ width: '100%', minHeight: 320 }} />
}
