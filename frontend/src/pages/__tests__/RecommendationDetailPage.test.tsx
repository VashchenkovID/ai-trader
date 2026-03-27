import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MarketService } from '@/api/generated/services/MarketService'
import { NewsService } from '@/api/generated/services/NewsService'
import { RecommendationDetailPage } from '../RecommendationDetailPage'

jest.mock('../RecommendationDetailPage/components/CandlesVolumeChart', () => ({
  CandlesVolumeChart: () => <div data-testid="candles-chart-mock" />,
}))

jest.mock('../RecommendationDetailPage/components/WeeklyForecastChart', () => ({
  WeeklyForecastChart: () => <div data-testid="weekly-chart-mock" />,
}))

describe('RecommendationDetailPage', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders detail sections from API', async () => {
    jest.spyOn(MarketService, 'marketRecommendationByFigiApiV1MarketRecommendationsFigiGet').mockResolvedValue({
      success: true,
      data: {
        id: '1',
        figi: 'BBG001',
        ticker: 'TST',
        name: 'Тест',
        recommendation: 'BUY',
        confidence: 0.8,
        score: 0.7,
        analysisDate: '2026-01-01T00:00:00Z',
        lastPrice: 100,
        tradePlan: { status: 'ready', horizon: '1w' },
        explain: { summary: 'Тестовое объяснение.' },
      },
    } as never)

    jest.spyOn(MarketService, 'marketStockCandlesApiV1MarketStockFigiCandlesGet').mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            time: '2026-01-01T00:00:00Z',
            open: 99,
            high: 101,
            low: 98,
            close: 100,
            volume: 1000,
          },
        ],
        meta: { total: 1 },
      },
    } as never)

    jest.spyOn(MarketService, 'marketStockWeeklyForecastApiV1MarketStockFigiWeeklyForecastGet').mockResolvedValue({
      success: true,
      data: { ok: true, forecastRaw: [0.01, -0.02], nForecast: 2, lastClose: 100 },
    } as never)

    jest.spyOn(MarketService, 'marketStockAnalystSignalsApiV1MarketStockFigiAnalystSignalsGet').mockResolvedValue({
      success: true,
      data: { items: [], meta: { total: 0 } },
    } as never)

    jest.spyOn(NewsService, 'newsByFigiApiV1NewsFigiGet').mockResolvedValue({
      success: true,
      data: { items: [], meta: { total: 0 } },
    } as never)

    render(
      <MemoryRouter initialEntries={['/recommendations/BBG001']}>
        <Routes>
          <Route path="/recommendations/:figi" element={<RecommendationDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect((await screen.findAllByText('Тест')).length).toBeGreaterThan(0)
    await waitFor(() => {
      expect(screen.getByText('Цена и объём')).toBeInTheDocument()
      expect(screen.getByText('Прогноз Weekly LSTM')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Обновить прогноз' })).toBeInTheDocument()
    })
  })

  it('calls weekly forecast with refresh when clicking Обновить прогноз', async () => {
    jest.spyOn(MarketService, 'marketRecommendationByFigiApiV1MarketRecommendationsFigiGet').mockResolvedValue({
      success: true,
      data: {
        id: '1',
        figi: 'BBG002',
        ticker: 'RFR',
        name: 'Refresh',
        recommendation: 'HOLD',
        confidence: 0.5,
        score: 0.5,
        analysisDate: '2026-01-01T00:00:00Z',
        lastPrice: 50,
        tradePlan: { status: 'ready', horizon: '1w' },
        explain: { summary: '—' },
      },
    } as never)

    jest.spyOn(MarketService, 'marketStockCandlesApiV1MarketStockFigiCandlesGet').mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            time: '2026-01-01T00:00:00Z',
            open: 49,
            high: 51,
            low: 48,
            close: 50,
            volume: 500,
          },
        ],
        meta: { total: 1 },
      },
    } as never)

    const weeklySpy = jest
      .spyOn(MarketService, 'marketStockWeeklyForecastApiV1MarketStockFigiWeeklyForecastGet')
      .mockResolvedValueOnce({
        success: true,
        data: { ok: true, forecastRaw: [0.01], nForecast: 1, lastClose: 50 },
      } as never)
      .mockResolvedValueOnce({
        success: true,
        data: { ok: true, forecastRaw: [0.02], nForecast: 1, lastClose: 50 },
      } as never)

    jest.spyOn(MarketService, 'marketStockAnalystSignalsApiV1MarketStockFigiAnalystSignalsGet').mockResolvedValue({
      success: true,
      data: { items: [], meta: { total: 0 } },
    } as never)

    jest.spyOn(NewsService, 'newsByFigiApiV1NewsFigiGet').mockResolvedValue({
      success: true,
      data: { items: [], meta: { total: 0 } },
    } as never)

    render(
      <MemoryRouter initialEntries={['/recommendations/BBG002']}>
        <Routes>
          <Route path="/recommendations/:figi" element={<RecommendationDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await screen.findByRole('button', { name: 'Обновить прогноз' })
    expect(weeklySpy).toHaveBeenCalledWith({ figi: 'BBG002', refresh: false })

    await userEvent.click(screen.getByRole('button', { name: 'Обновить прогноз' }))

    await waitFor(() => {
      expect(weeklySpy).toHaveBeenCalledWith({ figi: 'BBG002', refresh: true })
    })
  })
})
