import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PrimeReactProvider } from 'primereact/api';

// Components
import Navigation from './components/Navigation';

// Contexts
import { WebSocketDataProvider } from './components/WebSocketDataProvider';

// Hooks
import { useErrorHandler } from './hooks/useErrorHandler';

// Pages
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import NeuralNetworks from './pages/NeuralNetworks';
import TradingModeManager from './pages/TradingModeManager';
import MetricsMonitoring from './pages/MetricsMonitoring';
import TradingRequests from './pages/TradingRequests';
import Recommendations from './pages/Recommendations';
import Portfolio from './pages/Portfolio';
import TrainingDebug from './pages/TrainingDebug';
import StockDetail from './pages/StockDetail';

function App() {
  // Инициализируем глобальный обработчик ошибок
  useErrorHandler();

  return (
    <PrimeReactProvider>
      <WebSocketDataProvider>
        <BrowserRouter>
          <div className="app flex h-screen">
            <Navigation />
            <main className="main-content flex-1 overflow-auto">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/neural-networks" element={<NeuralNetworks />} />
                <Route path="/trading-mode" element={<TradingModeManager />} />
                <Route path="/metrics" element={<MetricsMonitoring />} />
                <Route path="/trading-requests" element={<TradingRequests />} />
                <Route path="/recommendations" element={<Recommendations />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/training-debug" element={<TrainingDebug />} />
                <Route path="/stock/:figi" element={<StockDetail />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      </WebSocketDataProvider>
    </PrimeReactProvider>
  );
}

export default App;
