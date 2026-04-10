import { PortfolioService, TradingModeService, SettingsService } from '@/api/generated'
import * as auth from '@/services/auth'
import { useTradingCoreStore } from '@/store/tradingCoreStore'

jest.mock('@/services/auth', () => ({
  verifyStoredSession: jest.fn(),
}))

describe('tradingCoreStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useTradingCoreStore.getState().reset()
    jest.restoreAllMocks()
  })

  it('ensureLoaded uses GET /portfolio/virtual in paper mode', async () => {
    jest.mocked(auth.verifyStoredSession).mockResolvedValue({
      ok: true,
      token: 't',
      user: { id: 1, username: 'u', fullName: 'User' },
    })
    jest.spyOn(TradingModeService, 'tradingModeCurrentApiV1TradingModeCurrentGet').mockResolvedValue({
      data: { mode: 'paper' },
    } as never)
    jest.spyOn(PortfolioService, 'getVirtualPortfolioApiV1PortfolioVirtualGet').mockResolvedValue({
      data: {
        cash: 1,
        positionsValue: 2,
        totalValue: 3,
        positionsList: [],
        isVirtual: true,
      },
    } as never)

    await useTradingCoreStore.getState().ensureLoaded()

    const s = useTradingCoreStore.getState()
    expect(s.isLoaded).toBe(true)
    expect(s.portfolioKind).toBe('virtual')
    expect(s.totalBalance).toBe(3)
    expect(s.stocksValue).toBe(2)
    expect(s.profile?.username).toBe('u')
    expect(PortfolioService.getVirtualPortfolioApiV1PortfolioVirtualGet).toHaveBeenCalledWith({
      profile: 'moderate',
      includeTrades: false,
    })
  })

  it('ensureLoaded passes stored paper profile slug to virtual API', async () => {
    localStorage.setItem('ai-trader.paperVirtualProfileSlug', 'aggressive')
    useTradingCoreStore.getState().reset()

    jest.mocked(auth.verifyStoredSession).mockResolvedValue({
      ok: true,
      token: 't',
      user: { id: 1, username: 'u', fullName: 'User' },
    })
    jest.spyOn(TradingModeService, 'tradingModeCurrentApiV1TradingModeCurrentGet').mockResolvedValue({
      data: { mode: 'paper' },
    } as never)
    jest.spyOn(PortfolioService, 'getVirtualPortfolioApiV1PortfolioVirtualGet').mockResolvedValue({
      data: { cash: 0, positionsValue: 0, totalValue: 1, positionsList: [], isVirtual: true },
    } as never)

    await useTradingCoreStore.getState().ensureLoaded()

    expect(useTradingCoreStore.getState().paperVirtualProfileSlug).toBe('aggressive')
    expect(PortfolioService.getVirtualPortfolioApiV1PortfolioVirtualGet).toHaveBeenCalledWith({
      profile: 'aggressive',
      includeTrades: false,
    })
  })

  it('ensureLoaded falls back to settings initial capital when virtual API fails', async () => {
    jest.mocked(auth.verifyStoredSession).mockResolvedValue({
      ok: true,
      token: 't',
      user: { id: 1, username: 'u', fullName: 'User' },
    })
    jest.spyOn(TradingModeService, 'tradingModeCurrentApiV1TradingModeCurrentGet').mockResolvedValue({
      data: { mode: 'paper' },
    } as never)
    jest.spyOn(PortfolioService, 'getVirtualPortfolioApiV1PortfolioVirtualGet').mockRejectedValue(new Error('down'))
    jest.spyOn(SettingsService, 'getSettingsApiV1SettingsGet').mockResolvedValue({
      data: {
        items: [{ key: 'portfolio.virtual.initial_capital', value: '9000000' }],
      },
    } as never)

    await useTradingCoreStore.getState().ensureLoaded()

    const s = useTradingCoreStore.getState()
    expect(s.isLoaded).toBe(true)
    expect(s.portfolioKind).toBe('virtual')
    expect(s.totalBalance).toBe(9_000_000)
  })

  it('reset clears state', () => {
    useTradingCoreStore.setState({
      profile: { id: 1, username: 'x', fullName: 'X' },
      isLoaded: true,
    })
    useTradingCoreStore.getState().reset()
    expect(useTradingCoreStore.getState().profile).toBeNull()
    expect(useTradingCoreStore.getState().isLoaded).toBe(false)
  })
})
