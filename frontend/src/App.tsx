import { Box, CircularProgress, Typography } from '@mui/material'
import { lazy, useEffect, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { labRoutesEnabled } from '@/config/labRoutes'
import { LoginPage } from '@/pages/LoginPage'

const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage })),
)
const VirtualTradingPage = lazy(() =>
  import('@/pages/VirtualTradingPage').then(m => ({ default: m.VirtualTradingPage })),
)
const VirtualPortfoliosPage = lazy(() =>
  import('@/pages/VirtualPortfoliosPage').then(m => ({ default: m.VirtualPortfoliosPage })),
)
const PortfolioPage = lazy(() =>
  import('@/pages/PortfolioPage').then(m => ({ default: m.PortfolioPage })),
)
const RecommendationsPage = lazy(() =>
  import('@/pages/RecommendationsPage').then(m => ({ default: m.RecommendationsPage })),
)
const RecommendationDetailPage = lazy(() =>
  import('@/pages/RecommendationDetailPage').then(m => ({ default: m.RecommendationDetailPage })),
)
const TradingRequestsPage = lazy(() =>
  import('@/pages/TradingRequestsPage').then(m => ({ default: m.TradingRequestsPage })),
)
const MonitoringAlertsPage = lazy(() =>
  import('@/pages/MonitoringAlertsPage').then(m => ({ default: m.MonitoringAlertsPage })),
)
const RiskPage = lazy(() => import('@/pages/RiskPage').then(m => ({ default: m.RiskPage })))
const PerformancePage = lazy(() =>
  import('@/pages/PerformancePage').then(m => ({ default: m.PerformancePage })),
)
const PortfolioAnalyzerPage = lazy(() =>
  import('@/pages/PortfolioAnalyzerPage').then(m => ({ default: m.PortfolioAnalyzerPage })),
)
const BacktestSmaPage = lazy(() =>
  import('@/pages/BacktestSmaPage').then(m => ({ default: m.BacktestSmaPage })),
)
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then(m => ({ default: m.SettingsPage })),
)
const ManualLlmImportPage = lazy(() =>
  import('@/pages/ManualLlmImportPage').then(m => ({ default: m.ManualLlmImportPage })),
)
import { verifyStoredSession } from '@/services/auth'
import { useSystemStatusStore } from '@/store/systemStatusStore'
import { useTradingCoreStore } from '@/store/tradingCoreStore'

function ProtectedWithRealtime({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'allowed' | 'denied'>('checking')

  useEffect(() => {
    let active = true
    const check = async () => {
      const session = await verifyStoredSession()
      if (!active) return
      setStatus(session.ok ? 'allowed' : 'denied')
    }
    void check()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (status !== 'allowed') return
    useSystemStatusStore.getState().connect()
    void useTradingCoreStore.getState().ensureLoaded()
    return () => {
      useSystemStatusStore.getState().disconnect()
      useTradingCoreStore.getState().reset()
    }
  }, [status])

  if (status === 'checking') {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress color="primary" />
        <Typography color="text.secondary">Проверяем токен…</Typography>
      </Box>
    )
  }

  if (status === 'denied') {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function RootRedirect() {
  const [target, setTarget] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const run = async () => {
      const session = await verifyStoredSession()
      if (!active) return
      setTarget(session.ok ? '/dashboard' : '/login')
    }
    void run()
    return () => {
      active = false
    }
  }, [])

  if (!target) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress color="primary" />
        <Typography color="text.secondary">Проверяем токен…</Typography>
      </Box>
    )
  }

  return <Navigate to={target} replace />
}

function RouteDataGuard() {
  const location = useLocation()

  useEffect(() => {
    if (location.pathname === '/login') return
    const state = useTradingCoreStore.getState()
    if (!state.isLoaded) {
      void state.ensureLoaded()
    }
  }, [location.pathname])

  return null
}

function ProtectedLayout() {
  return (
    <ProtectedWithRealtime>
      <AppShell />
    </ProtectedWithRealtime>
  )
}

export default function App() {
  return (
    <>
      <RouteDataGuard />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/virtual-trading" element={<VirtualTradingPage />} />
          <Route path="/virtual-portfolios" element={<VirtualPortfoliosPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/recommendations" element={<RecommendationsPage />} />
          <Route path="/recommendations/:figi" element={<RecommendationDetailPage />} />
          <Route path="/trading-requests" element={<TradingRequestsPage />} />
          <Route path="/monitoring/alerts" element={<MonitoringAlertsPage />} />
          <Route path="/risk" element={<RiskPage />} />
          <Route path="/performance" element={<PerformancePage />} />
          {labRoutesEnabled ? (
            <>
              <Route path="/portfolio-analyzer" element={<PortfolioAnalyzerPage />} />
              <Route path="/backtest-sma" element={<BacktestSmaPage />} />
            </>
          ) : (
            <>
              <Route path="/portfolio-analyzer" element={<Navigate to="/dashboard" replace />} />
              <Route path="/backtest-sma" element={<Navigate to="/dashboard" replace />} />
            </>
          )}
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/manual-llm-import" element={<ManualLlmImportPage />} />
        </Route>

        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </>
  )
}
