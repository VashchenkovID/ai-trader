import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { DashboardPage } from '@/pages/DashboardPage'
import { LoginPage } from '@/pages/LoginPage'
import { verifyStoredSession } from '@/services/auth'
import { Text } from '@/components/ui'
import { useSystemStatusStore } from '@/store/systemStatusStore'
import { useTradingCoreStore } from '@/store/tradingCoreStore'

function DashboardWithRealtime() {
  useEffect(() => {
    useSystemStatusStore.getState().connect()
    void useTradingCoreStore.getState().ensureLoaded()
  }, [])

  return <DashboardPage />
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

function ProtectedDashboardRoute() {
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

  return <DashboardWithRealtime />
}

function App() {
  return (
    <>
      <RouteDataGuard />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<ProtectedDashboardRoute />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  )
}

export default App
