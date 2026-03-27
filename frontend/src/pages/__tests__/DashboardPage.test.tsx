import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DashboardPage } from '../DashboardPage'
import { MarketService } from '@/api/generated/services/MarketService'
import { MonitoringService } from '@/api/generated/services/MonitoringService'
import { RiskService } from '@/api/generated/services/RiskService'

const mockSystemState = {
  connectionStatus: 'connected',
  lastEventAt: '2026-03-27T10:00:00Z',
  tasks: [
    { taskId: 't-1', taskType: 'weekly_update', status: 'running' },
    { taskId: 't-2', taskType: 'cache_update', status: 'failed' },
  ],
  scheduler: { cache_update: { name: 'cache_update', status: 'running' } },
}

const mockCoreState = {
  profile: { username: 'trader' },
  tradingMode: { mode: 'paper' },
  portfolioKind: 'virtual',
  totalBalance: 1_500_000,
  profitLoss: 12_345,
  lastPortfolioUpdatedAt: '2026-03-27T10:01:00Z',
  refreshPortfolio: jest.fn().mockResolvedValue(undefined),
  isLoading: false,
  error: null,
}

jest.mock('@/store/systemStatusStore', () => ({
  useSystemStatusStore: (selector: (state: typeof mockSystemState) => unknown) =>
    selector(mockSystemState),
}))

jest.mock('@/store/tradingCoreStore', () => ({
  useTradingCoreStore: (selector: (state: typeof mockCoreState) => unknown) => selector(mockCoreState),
}))

describe('DashboardPage', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders dashboard with real API-backed sections', async () => {
    jest.spyOn(MarketService, 'marketRecommendationsApiV1MarketRecommendationsGet').mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 'rec-1',
            figi: 'BBG0001',
            ticker: 'SBER',
            name: 'Сбербанк',
            recommendation: 'BUY',
            confidence: 0.8,
            score: 0.7,
          },
        ],
        meta: { total: 1 },
      },
    } as never)
    jest.spyOn(MonitoringService, 'monitoringAlertsApiV1MonitoringAlertsGet').mockResolvedValue({
      success: true,
      data: { items: [{ id: 'a-1' }] },
    } as never)
    jest.spyOn(RiskService, 'riskStatusApiV1RiskStatusGet').mockResolvedValue({
      success: true,
      data: { emergencyStop: false, limits: { maxPositionSize: 0.1 } },
    } as never)

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <DashboardPage />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'Главная панель' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Риск и предупреждения')).toBeInTheDocument())
    expect(screen.getByText('Топ рекомендаций')).toBeInTheDocument()
    expect(screen.getByText('Фоновые задачи')).toBeInTheDocument()
    expect(screen.getByText('Сбербанк (SBER)')).toBeInTheDocument()
    expect(screen.getByText(/Активные алерты мониторинга/)).toBeInTheDocument()
  })
})

