import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

jest.mock('@/api/tradingRequestsExtras', () => ({
  previewTradingRequest: jest.fn(),
}))

jest.mock('@/api/generated/services/PortfolioService', () => ({
  PortfolioService: {
    getVirtualPortfolioApiV1PortfolioVirtualGet: jest.fn().mockResolvedValue({
      success: true,
      data: { totalValue: 1_000_000 },
    }),
  },
}))

jest.mock('@/api/generated/services/RiskService', () => ({
  RiskService: {
    riskValidateApiV1RiskValidatePost: jest.fn(),
  },
}))

jest.mock('@/api/generated/services/TradingRequestsService', () => ({
  TradingRequestsService: {
    tradingRequestCreateApiV1TradingRequestsCreatePost: jest.fn(),
  },
}))

jest.mock('@/store/tradingCoreStore', () => ({
  useTradingCoreStore: (selector: (s: { tradingMode: { mode: string } }) => unknown) =>
    selector({ tradingMode: { mode: 'paper' } }),
}))

import { RiskService } from '@/api/generated/services/RiskService'
import { TradingRequestsService } from '@/api/generated/services/TradingRequestsService'
import { previewTradingRequest } from '@/api/tradingRequestsExtras'
import { QuickTradeButton } from '../QuickTradeButton'

describe('QuickTradeButton', () => {
  beforeEach(() => {
    jest.mocked(previewTradingRequest).mockResolvedValue({
      success: true,
      data: {
        ok: true,
        figi: 'F1',
        action: 'BUY',
        mode: 'paper',
        quantity: 1,
        price: 100,
        budget: 100,
        ticker: 'T',
        recommendation: 'BUY',
        hasActiveRequest: false,
      },
    })
    jest.mocked(RiskService.riskValidateApiV1RiskValidatePost).mockResolvedValue({
      success: true,
      data: { isValid: true, warnings: [], errors: [] },
    })
    jest.mocked(TradingRequestsService.tradingRequestCreateApiV1TradingRequestsCreatePost).mockResolvedValue({
      success: true,
      data: {},
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('opens modal and shows preview numbers', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <QuickTradeButton
          intent="buy"
          source={{ kind: 'recommendationFigi', figi: 'F1' }}
          confidence={0.5}
          score={0.5}
          portfolioTotalValue={1_000_000}
        />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Купить' }))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
    expect(await screen.findByText(/Количество:/)).toBeInTheDocument()
    expect(screen.getByText(/Проверка пройдена/)).toBeInTheDocument()
  })
})
