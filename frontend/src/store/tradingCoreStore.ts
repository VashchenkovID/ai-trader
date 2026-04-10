import { create } from 'zustand'
import {
  PortfolioService,
  SettingsService,
  TradingModeService,
  type UserDTO,
} from '@/api/generated'
import { verifyStoredSession } from '@/services/auth'
import {
  normalizePaperVirtualProfileSlug,
  persistPaperVirtualProfileSlug,
  readStoredPaperVirtualProfileSlug,
  type PaperVirtualProfileSlug,
} from '@/store/paperVirtualProfile'

type PortfolioUpdateSource = 'api' | 'socket'
type PortfolioKind = 'real' | 'virtual'
type TradingMode = 'paper' | 'real' | 'micro' | string

type TradingCoreState = {
  profile: UserDTO | null
  tradingMode: Record<string, unknown> | null
  portfolio: Record<string, unknown> | null
  portfolioKind: PortfolioKind | null
  /** Профиль виртуального портфеля для paper (`GET /portfolio/virtual?profile=`). */
  paperVirtualProfileSlug: PaperVirtualProfileSlug
  totalBalance: number
  stocksValue: number
  profitLoss: number
  lastPortfolioUpdatedAt: string | null
  lastPortfolioUpdateSource: PortfolioUpdateSource | null
  isLoaded: boolean
  isLoading: boolean
  error: string | null
  ensureLoaded: () => Promise<void>
  refreshPortfolio: (source?: PortfolioUpdateSource) => Promise<void>
  setPaperVirtualProfileSlug: (slug: string) => void
  reset: () => void
}

const toNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

const toNumberLike = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const getTradingMode = (tradingMode: Record<string, unknown> | null): TradingMode =>
  String(tradingMode?.mode ?? 'paper').toLowerCase()

const computeProfitLoss = (portfolio: Record<string, unknown>) => {
  const positionsList = Array.isArray(portfolio.positionsList) ? portfolio.positionsList : []
  if (positionsList.length === 0) {
    return toNumber(portfolio.expectedYield)
  }

  return positionsList.reduce((acc, position) => {
    if (!position || typeof position !== 'object') return acc
    const expectedYield = (position as Record<string, unknown>).expectedYield
    if (typeof expectedYield === 'number') return acc + expectedYield
    if (expectedYield && typeof expectedYield === 'object') {
      return acc + toNumber((expectedYield as Record<string, unknown>).value)
    }
    return acc
  }, 0)
}

const mapPortfolioMetrics = (portfolio: Record<string, unknown>) => {
  const cash = toNumber(portfolio.cash)
  const stocksValue = toNumber(portfolio.positionsValue)
  const totalFromApi = toNumber(portfolio.totalValue)
  const totalBalance = totalFromApi > 0 ? totalFromApi : cash + stocksValue
  const profitLoss = computeProfitLoss(portfolio)

  return { totalBalance, stocksValue, profitLoss }
}

const buildVirtualPortfolio = (initialCapital: number): Record<string, unknown> => ({
  cash: initialCapital,
  positions: {},
  totalValue: initialCapital,
  positionsValue: 0,
  positionsList: [],
  isVirtual: true,
})

/** Fallback, если `GET /portfolio/virtual` недоступен (сеть / БД). */
const virtualPortfolioFromSettings = async (): Promise<Record<string, unknown>> => {
  const response = await SettingsService.getSettingsApiV1SettingsGet({ limit: 500 })
  const items = Array.isArray(response.data?.items) ? response.data.items : []
  const initialCapitalItem = items.find(item => item?.key === 'portfolio.virtual.initial_capital')
  const initialCapital = toNumberLike(initialCapitalItem?.value) || 1_000_000
  return buildVirtualPortfolio(initialCapital)
}

const fetchVirtualPortfolio = async (
  profileSlug: PaperVirtualProfileSlug,
): Promise<Record<string, unknown>> => {
  try {
    const res = await PortfolioService.getVirtualPortfolioApiV1PortfolioVirtualGet({
      profile: profileSlug,
      includeTrades: false,
    })
    const data = res.data
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as Record<string, unknown>
    }
  } catch {
    /* fallback ниже */
  }
  return virtualPortfolioFromSettings()
}

export const useTradingCoreStore = create<TradingCoreState>((set, get) => ({
  profile: null,
  tradingMode: null,
  portfolio: null,
  portfolioKind: null,
  paperVirtualProfileSlug: readStoredPaperVirtualProfileSlug(),
  totalBalance: 0,
  stocksValue: 0,
  profitLoss: 0,
  lastPortfolioUpdatedAt: null,
  lastPortfolioUpdateSource: null,
  isLoaded: false,
  isLoading: false,
  error: null,

  ensureLoaded: async () => {
    const state = get()
    if (state.isLoading) return
    if (state.profile && state.tradingMode && state.portfolio) {
      set({ isLoaded: true, error: null })
      return
    }

    set({ isLoading: true, error: null })
    try {
      const session = await verifyStoredSession()
      if (!session.ok || !session.user) {
        throw new Error('Сессия недействительна')
      }

      const tradingModeResponse =
        await TradingModeService.tradingModeCurrentApiV1TradingModeCurrentGet()
      const tradingMode = tradingModeResponse.data ?? null
      const mode = getTradingMode(tradingMode)
      const slug = get().paperVirtualProfileSlug
      const portfolioData =
        mode === 'paper'
          ? await fetchVirtualPortfolio(slug)
          : ((await PortfolioService.getPortfolioApiV1PortfolioGet1()).data ?? null)

      set({
        profile: session.user,
        tradingMode,
        portfolio: portfolioData,
        portfolioKind: mode === 'paper' ? 'virtual' : 'real',
        ...(portfolioData ? mapPortfolioMetrics(portfolioData) : {}),
        lastPortfolioUpdatedAt: portfolioData ? new Date().toISOString() : null,
        lastPortfolioUpdateSource: portfolioData ? 'api' : null,
        isLoaded: true,
        error: null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить core данные'
      set({
        isLoaded: false,
        error: message,
      })
    } finally {
      set({ isLoading: false })
    }
  },

  refreshPortfolio: async (source = 'api') => {
    const mode = getTradingMode(get().tradingMode)
    const slug = get().paperVirtualProfileSlug
    const portfolio =
      mode === 'paper'
        ? await fetchVirtualPortfolio(slug)
        : ((await PortfolioService.getPortfolioApiV1PortfolioGet1()).data ?? null)
    set({
      portfolio,
      portfolioKind: mode === 'paper' ? 'virtual' : 'real',
      ...(portfolio ? mapPortfolioMetrics(portfolio) : {}),
      lastPortfolioUpdatedAt: portfolio ? new Date().toISOString() : null,
      lastPortfolioUpdateSource: portfolio ? source : null,
    })
  },

  setPaperVirtualProfileSlug: (slug: string) => {
    const normalized = normalizePaperVirtualProfileSlug(slug)
    const prev = get().paperVirtualProfileSlug
    if (normalized === prev) return
    persistPaperVirtualProfileSlug(normalized)
    set({ paperVirtualProfileSlug: normalized })
    if (getTradingMode(get().tradingMode) === 'paper') {
      void get().refreshPortfolio('api')
    }
  },

  reset: () => {
    set({
      profile: null,
      tradingMode: null,
      portfolio: null,
      portfolioKind: null,
      paperVirtualProfileSlug: readStoredPaperVirtualProfileSlug(),
      totalBalance: 0,
      stocksValue: 0,
      profitLoss: 0,
      lastPortfolioUpdatedAt: null,
      lastPortfolioUpdateSource: null,
      isLoaded: false,
      isLoading: false,
      error: null,
    })
  },
}))
