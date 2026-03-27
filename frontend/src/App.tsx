import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AutoPaperPage } from '@/pages/AutoPaperPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { LoginPage } from '@/pages/LoginPage'
import { MonitoringAlertsPage } from '@/pages/MonitoringAlertsPage'
import { PerformancePage } from '@/pages/PerformancePage'
import { PortfolioPage } from '@/pages/PortfolioPage'
import { RecommendationDetailPage } from '@/pages/RecommendationDetailPage'
import { RecommendationsPage } from '@/pages/RecommendationsPage'
import { RiskPage } from '@/pages/RiskPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TinkoffPage } from '@/pages/TinkoffPage'
import { TradingRequestsPage } from '@/pages/TradingRequestsPage'
import { TrainingPipelinePage } from '@/pages/TrainingPipelinePage'
import { verifyStoredSession } from '@/services/auth'
import { Text } from '@/components/ui'
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
  }, [status])

  if (status === 'checking') {
    return (
      <main>
        <Text as="p" variant="body" tone="muted">
          Проверяем токен...
        </Text>
      </main>
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
      <main>
        <Text as="p" variant="body" tone="muted">
          Проверяем токен...
        </Text>
      </main>
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

function App() {
  return (
    <>
      <RouteDataGuard />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RootRedirect />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedWithRealtime>
              <DashboardPage />
            </ProtectedWithRealtime>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedWithRealtime>
              <SettingsPage />
            </ProtectedWithRealtime>
          }
        />
        <Route
          path="/recommendations"
          element={
            <ProtectedWithRealtime>
              <RecommendationsPage />
            </ProtectedWithRealtime>
          }
        />
        <Route
          path="/recommendations/:figi"
          element={
            <ProtectedWithRealtime>
              <RecommendationDetailPage />
            </ProtectedWithRealtime>
          }
        />
        <Route
          path="/trading-requests"
          element={
            <ProtectedWithRealtime>
              <TradingRequestsPage />
            </ProtectedWithRealtime>
          }
        />
        <Route
          path="/portfolio"
          element={
            <ProtectedWithRealtime>
              <PortfolioPage />
            </ProtectedWithRealtime>
          }
        />
        <Route
          path="/monitoring/alerts"
          element={
            <ProtectedWithRealtime>
              <MonitoringAlertsPage />
            </ProtectedWithRealtime>
          }
        />
        <Route
          path="/auto-paper"
          element={
            <ProtectedWithRealtime>
              <AutoPaperPage />
            </ProtectedWithRealtime>
          }
        />
        <Route
          path="/performance"
          element={
            <ProtectedWithRealtime>
              <PerformancePage />
            </ProtectedWithRealtime>
          }
        />
        <Route
          path="/risk"
          element={
            <ProtectedWithRealtime>
              <RiskPage />
            </ProtectedWithRealtime>
          }
        />
        <Route
          path="/tinkoff"
          element={
            <ProtectedWithRealtime>
              <TinkoffPage />
            </ProtectedWithRealtime>
          }
        />
        <Route
          path="/training"
          element={
            <ProtectedWithRealtime>
              <TrainingPipelinePage />
            </ProtectedWithRealtime>
          }
        />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </>
  )
}

export default App
