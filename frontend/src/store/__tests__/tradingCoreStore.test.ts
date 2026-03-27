import { TradingModeService, SettingsService } from '@/api/generated'
import * as auth from '@/services/auth'
import { useTradingCoreStore } from '@/store/tradingCoreStore'

jest.mock('@/services/auth', () => ({
  verifyStoredSession: jest.fn(),
}))

describe('tradingCoreStore', () => {
  beforeEach(() => {
    useTradingCoreStore.getState().reset()
    jest.restoreAllMocks()
  })

  it('ensureLoaded sets virtual portfolio in paper mode', async () => {
    jest.mocked(auth.verifyStoredSession).mockResolvedValue({
      ok: true,
      token: 't',
      user: { id: 1, username: 'u', fullName: 'User' },
    })
    jest.spyOn(TradingModeService, 'tradingModeCurrentApiV1TradingModeCurrentGet').mockResolvedValue({
      data: { mode: 'paper' },
    } as never)
    jest.spyOn(SettingsService, 'getSettingsApiV1SettingsGet').mockResolvedValue({
      data: {
        items: [{ key: 'portfolio.virtual.initial_capital', value: '5000000' }],
      },
    } as never)

    await useTradingCoreStore.getState().ensureLoaded()

    const s = useTradingCoreStore.getState()
    expect(s.isLoaded).toBe(true)
    expect(s.portfolioKind).toBe('virtual')
    expect(s.totalBalance).toBe(5_000_000)
    expect(s.profile?.username).toBe('u')
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
