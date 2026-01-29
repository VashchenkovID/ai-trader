import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PrimeReactProvider } from 'primereact/api';

// Components
import Navigation from './components/Navigation';
import Login from './components/auth/Login';
import ProtectedRoute from './components/auth/ProtectedRoute';

// Contexts
import { WebSocketDataProvider } from './components/WebSocketDataProvider';
import { ThemeProvider } from './contexts/ThemeContext';

// Hooks
import { useErrorHandler } from './hooks/useErrorHandler';

// Pages
import Dashboard from './pages/Dashboard/Dashboard.tsx';
import Settings from './pages/Settings';
import TradingRequests from './pages/TradingRequests';
import Recommendations from './pages/Recommendations/Recommendations.tsx';
import Portfolio from './pages/Portfolio/Portfolio.tsx';
import TrainingDebug from './pages/TrainingDebug';
import StockDetail from './pages/StockDetail';
import DesignSystemTest from './pages/DesignSystemTest/DesignSystemTest.tsx';
import Performance from './pages/Performance/Performance.tsx';
import WorkerMonitoring from './pages/WorkerMonitoring/WorkerMonitoring.tsx';

function App() {
  // Инициализируем глобальный обработчик ошибок
  useErrorHandler();

  return (
    <PrimeReactProvider>
      <ThemeProvider defaultTheme="dark">
        <WebSocketDataProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <div className="app flex h-screen">
                      <Navigation />
                      <main className="main-content flex-1 overflow-auto">
                        <Routes>
                          <Route path="/" element={<Dashboard />} />
                          <Route path="/settings" element={<Settings />} />
                          <Route path="/trading-requests" element={<TradingRequests />} />
                          <Route path="/recommendations" element={<Recommendations />} />
                          <Route path="/portfolio" element={<Portfolio />} />
                          <Route path="/training-debug" element={<TrainingDebug />} />
                          <Route path="/design-system-test" element={<DesignSystemTest />} />
                          <Route path="/performance" element={<Performance />} />
                          <Route path="/worker-monitoring" element={<WorkerMonitoring />} />
                          <Route path="/stock/:figi" element={<StockDetail />} />
                          <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                      </main>
                    </div>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </BrowserRouter>
        </WebSocketDataProvider>
      </ThemeProvider>
    </PrimeReactProvider>
  );
}

export default App;
