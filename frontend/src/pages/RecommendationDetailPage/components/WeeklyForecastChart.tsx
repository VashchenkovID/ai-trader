import { useEffect, useRef } from 'react'
import { ColorType, createChart } from 'lightweight-charts'
import type { LineData, UTCTimestamp } from 'lightweight-charts'

type WeeklyForecastChartProps = {
  lastCandleTimeIso: string
  forecastRaw: number[]
  className?: string
}

function toUtc(ts: string): UTCTimestamp {
  return Math.floor(new Date(ts).getTime() / 1000) as UTCTimestamp
}

export function WeeklyForecastChart({
  lastCandleTimeIso,
  forecastRaw,
  className,
}: WeeklyForecastChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || forecastRaw.length === 0) return

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#6b7280',
      },
      grid: {
        vertLines: { color: '#e5e7eb' },
        horzLines: { color: '#e5e7eb' },
      },
      width: el.clientWidth,
      height: 220,
      timeScale: { borderColor: '#e5e7eb' },
      rightPriceScale: { borderColor: '#e5e7eb' },
    })

    const start = new Date(lastCandleTimeIso)
    const lineData: LineData[] = forecastRaw.map((v, i) => {
      const t = new Date(start)
      t.setDate(t.getDate() + i + 1)
      return { time: toUtc(t.toISOString()), value: v }
    })

    const series = chart.addLineSeries({
      color: '#4f46e5',
      lineWidth: 2,
    })
    series.setData(lineData)
    chart.timeScale().fitContent()

    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) chart.applyOptions({ width: w })
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.remove()
    }
  }, [lastCandleTimeIso, forecastRaw])

  if (forecastRaw.length === 0) return null

  return <div ref={wrapRef} className={className} style={{ width: '100%', minHeight: 220 }} />
}
