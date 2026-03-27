import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import * as auth from '@/services/auth'

jest.mock('@/services/auth', () => ({
  verifyStoredSession: jest.fn(),
}))

jest.mock('@/pages/DashboardPage', () => ({
  DashboardPage: () => <div data-testid="page-dashboard">dashboard</div>,
}))
jest.mock('@/pages/LoginPage', () => ({
  LoginPage: () => <div data-testid="page-login">login</div>,
}))
jest.mock('@/pages/SettingsPage', () => ({
  SettingsPage: () => <div data-testid="page-settings">settings</div>,
}))
jest.mock('@/pages/RecommendationsPage', () => ({
  RecommendationsPage: () => <div data-testid="page-rec">rec</div>,
}))
jest.mock('@/pages/RecommendationDetailPage', () => ({
  RecommendationDetailPage: () => <div data-testid="page-rec-detail">detail</div>,
}))
jest.mock('@/pages/TradingRequestsPage', () => ({
  TradingRequestsPage: () => <div data-testid="page-tr">tr</div>,
}))
jest.mock('@/pages/PortfolioPage', () => ({
  PortfolioPage: () => <div data-testid="page-portfolio">portfolio</div>,
}))
jest.mock('@/pages/MonitoringAlertsPage', () => ({
  MonitoringAlertsPage: () => <div data-testid="page-alerts">alerts</div>,
}))
jest.mock('@/pages/AutoPaperPage', () => ({
  AutoPaperPage: () => <div data-testid="page-auto-paper">auto</div>,
}))
jest.mock('@/pages/PerformancePage', () => ({
  PerformancePage: () => <div data-testid="page-perf">perf</div>,
}))
jest.mock('@/pages/RiskPage', () => ({
  RiskPage: () => <div data-testid="page-risk">risk</div>,
}))
jest.mock('@/pages/TinkoffPage', () => ({
  TinkoffPage: () => <div data-testid="page-tinkoff">tinkoff</div>,
}))
jest.mock('@/pages/TrainingPipelinePage', () => ({
  TrainingPipelinePage: () => <div data-testid="page-training">training</div>,
}))

const connect = jest.fn()
jest.mock('@/store/systemStatusStore', () => {
  const useStore = () => ({})
  useStore.getState = () => ({ connect })
  return { useSystemStatusStore: useStore }
})

const ensureLoaded = jest.fn().mockResolvedValue(undefined)
jest.mock('@/store/tradingCoreStore', () => {
  const useStore = (sel: (s: { ensureLoaded: typeof ensureLoaded; isLoaded: boolean }) => unknown) =>
    sel({ ensureLoaded, isLoaded: true })
  useStore.getState = () => ({ ensureLoaded, isLoaded: true })
  return { useTradingCoreStore: useStore }
})

describe('App routing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('redirects / to /dashboard when session is valid', async () => {
    jest.mocked(auth.verifyStoredSession).mockResolvedValue({
      ok: true,
      token: 't',
      user: { username: 'u' },
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )

    expect(await screen.findByTestId('page-dashboard')).toBeInTheDocument()
  })

  it('redirects / to /login when session is invalid', async () => {
    jest.mocked(auth.verifyStoredSession).mockResolvedValue({
      ok: false,
      token: null,
      user: null,
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )

    expect(await screen.findByTestId('page-login')).toBeInTheDocument()
  })

  it('renders protected /portfolio when session is valid', async () => {
    jest.mocked(auth.verifyStoredSession).mockResolvedValue({
      ok: true,
      token: 't',
      user: { username: 'u' },
    })

    render(
      <MemoryRouter initialEntries={['/portfolio']}>
        <App />
      </MemoryRouter>
    )

    expect(await screen.findByTestId('page-portfolio')).toBeInTheDocument()
    await waitFor(() => expect(ensureLoaded).toHaveBeenCalled())
  })
})
