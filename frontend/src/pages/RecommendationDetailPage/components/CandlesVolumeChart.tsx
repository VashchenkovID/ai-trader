import { useEffect, useRef } from 'react'
import { ColorType, createChart } from 'lightweight-charts'
import type { CandlestickData, HistogramData, UTCTimestamp } from 'lightweight-charts'

export type CandleRow = {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

function toUtcDay(ts: string): UTCTimestamp {
  const d = new Date(ts)
  return Math.floor(d.getTime() / 1000) as UTCTimestamp
}

type CandlesVolumeChartProps = {
  candles: CandleRow[]
  className?: string
}

export function CandlesVolumeChart({ candles, className }: CandlesVolumeChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || candles.length === 0) return

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
      height: 360,
      timeScale: { borderColor: '#e5e7eb' },
      rightPriceScale: { borderColor: '#e5e7eb' },
    })

    const candleData: CandlestickData[] = candles.map(c => ({
      time: toUtcDay(c.time),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
    }))

    const volData: HistogramData[] = candles.map(c => {
      const up = Number(c.close) >= Number(c.open)
      return {
        time: toUtcDay(c.time),
        value: Number(c.volume) || 0,
        color: up ? '#0f766e80' : '#b4231880',
      }
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#0f766e',
      downColor: '#b42318',
      borderVisible: false,
      wickUpColor: '#0f766e',
      wickDownColor: '#b42318',
    })
    candleSeries.setData(candleData)

    const volSeries = chart.addHistogramSeries({
      color: '#94a3b8',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.72, bottom: 0 },
    })
    candleSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.08, bottom: 0.28 },
    })
    volSeries.setData(volData)

    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) chart.applyOptions({ width: w })
    })
    ro.observe(el)

    chart.timeScale().fitContent()

    return () => {
      ro.disconnect()
      chart.remove()
    }
  }, [candles])

  if (candles.length === 0) {
    return null
  }

  return <div ref={wrapRef} className={className} style={{ width: '100%', minHeight: 360 }} />
}
