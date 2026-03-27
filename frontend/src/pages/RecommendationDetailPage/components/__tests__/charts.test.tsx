import { render } from '@testing-library/react'
import { CandlesVolumeChart, type CandleRow } from '../CandlesVolumeChart'
import { WeeklyForecastChart } from '../WeeklyForecastChart'

const createChartMock = () => {
  const candleSeries = { setData: jest.fn(), priceScale: () => ({ applyOptions: jest.fn() }) }
  const volSeries = { setData: jest.fn() }
  return {
    remove: jest.fn(),
    applyOptions: jest.fn(),
    addCandlestickSeries: jest.fn(() => candleSeries),
    addHistogramSeries: jest.fn(() => volSeries),
    addLineSeries: jest.fn(() => ({ setData: jest.fn() })),
    priceScale: jest.fn(() => ({ applyOptions: jest.fn() })),
    timeScale: jest.fn(() => ({ fitContent: jest.fn() })),
  }
}

let lastChart: ReturnType<typeof createChartMock>

jest.mock('lightweight-charts', () => ({
  ColorType: { Solid: 'solid' },
  createChart: jest.fn(() => {
    lastChart = createChartMock()
    return lastChart
  }),
}))

describe('Recommendation detail charts', () => {
  const candles: CandleRow[] = [
    {
      time: '2026-01-01T00:00:00Z',
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      volume: 1000,
    },
  ]

  it('renders CandlesVolumeChart and builds chart', () => {
    const { container } = render(<CandlesVolumeChart candles={candles} />)
    expect(container.querySelector('div')).toBeTruthy()
    expect(lastChart.addCandlestickSeries).toHaveBeenCalled()
    expect(lastChart.timeScale).toHaveBeenCalled()
  })

  it('returns null for empty candles', () => {
    const { container } = render(<CandlesVolumeChart candles={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders WeeklyForecastChart', () => {
    const { container } = render(
      <WeeklyForecastChart lastCandleTimeIso="2026-01-01T00:00:00Z" forecastRaw={[1, 2, 3]} />
    )
    expect(container.querySelector('div')).toBeTruthy()
    expect(lastChart.addLineSeries).toHaveBeenCalled()
  })

  it('returns null when forecast empty', () => {
    const { container } = render(
      <WeeklyForecastChart lastCandleTimeIso="2026-01-01T00:00:00Z" forecastRaw={[]} />
    )
    expect(container.firstChild).toBeNull()
  })
})
