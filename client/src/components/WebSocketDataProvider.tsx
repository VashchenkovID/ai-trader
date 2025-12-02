import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

// Интерфейсы для типизации данных
export interface SystemStatus {
  neuralNetwork: any;
  websocket: any;
  database: any;
  trading: any;
  ensemble?: any;
}

export interface CacheStatus {
  lastUpdate: string;
  timeSinceLastUpdate: string;
  updateInterval: number;
  needsUpdate: boolean;
  nextUpdateIn: string;
}

export interface SystemResources {
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    usage: number;
    total: number;
    free: number;
  };
  uptime: number;
}

export interface TradingStats {
  // Баланс и прибыль
  portfolioValue: number; // Текущая стоимость портфеля
  cash: number;           // Свободные средства
  totalPnL: number;       // Суммарная прибыль/убыток по сделкам (валюта)

  // Статистика сделок
  winRate: number;        // WinRate в %, 0-100
  totalTrades: number;
  successfulTrades: number;

  // Топ-рекомендации
  recommendations?: {
    figi: string;
    ticker: string;
    name: string;
    recommendation: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    score: number;
  }[];
}

export interface AnalysisStatus {
  isAnalyzing: boolean;
  lastRunAt?: string;
}

export interface PerformanceMetrics {
  system: {
    uptime: number;
    memory: {
      heapUsed: number;
      heapTotal: number;
    };
    cacheSize: number;
  };
  trading: {
    totalPnL: number;
    winRate: number;
    totalTrades: number;
  };
}

export interface TrainingStatus {
  neuralNetwork: {
    isTraining: boolean;
    stage: string;
    progress: number;
  };
  ensemble: {
    isTraining: boolean;
    stage: string;
    progress: number;
  };
  metaLearning: {
    isTraining: boolean;
    stage: string;
    progress: number;
  };
  reinforcementLearning: {
    isTraining: boolean;
    stage: string;
    progress: number;
  };
}

// Контекст для WebSocket данных
interface WebSocketDataContextType {
  // Состояние подключения
  isConnected: boolean;
  error: string | null;
  
  // Данные
  systemStatus: SystemStatus | null;
  cacheStatus: CacheStatus | null;
  systemResources: SystemResources | null;
  tradingStats: TradingStats | null;
  performanceMetrics: PerformanceMetrics | null;
  trainingStatus: TrainingStatus | null;
  analysisStatus: AnalysisStatus | null;
  
  // Методы
  reconnect: () => void;
}

const WebSocketDataContext = createContext<WebSocketDataContextType | undefined>(undefined);

// Провайдер WebSocket данных
interface WebSocketDataProviderProps {
  children: ReactNode;
}

export const WebSocketDataProvider: React.FC<WebSocketDataProviderProps> = ({ children }) => {
  // WebSocket состояние
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [reconnectTimeout, setReconnectTimeout] = useState<number | null>(null);
  
  // Состояние для данных
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [systemResources, setSystemResources] = useState<SystemResources | null>(null);
  const [tradingStats, setTradingStats] = useState<TradingStats | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [trainingStatus, setTrainingStatus] = useState<TrainingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus | null>(null);

  // Отладка изменений состояния
  useEffect(() => {
    console.log('🔍 WebSocketDataProvider - systemStatus changed:', systemStatus);
  }, [systemStatus]);

  useEffect(() => {
    console.log('🔍 WebSocketDataProvider - cacheStatus changed:', cacheStatus);
  }, [cacheStatus]);

  // Обработка WebSocket сообщений
  const handleWebSocketMessage = (message: any) => {
    console.log('🔍 WebSocket message received:', message);
    switch (message.type) {
      case 'system_status_update':
        console.log('🔍 Setting system status:', message.data);
        console.log('🔍 Previous system status:', systemStatus);
        setSystemStatus(message.data);
        console.log('🔍 System status set, new value will be:', message.data);
        break;
      case 'cache_status_update':
        setCacheStatus(message.data);
        break;
      case 'system_resources_update':
        setSystemResources(message.data);
        break;
      case 'trading_stats_update':
        setTradingStats(message.data);
        break;
      case 'performance_metrics_update':
        setPerformanceMetrics(message.data);
        break;
      case 'training_status_update':
        console.log('🎯 Training status update received:', message.data);
        setTrainingStatus(message.data);
        break;
      case 'analysis_status_update':
        setAnalysisStatus(message.data);
        break;
      case 'batch_training_started':
      case 'batch_training_completed':
      case 'batch_training_failed':
      case 'meta_learning_batch_started':
      case 'meta_learning_batch_completed':
      case 'meta_learning_batch_failed':
      case 'rl_batch_started':
      case 'rl_batch_completed':
      case 'rl_batch_failed':
        // Обновляем статус обучения только если есть полная структура
        if (message.data && message.data.neuralNetwork && message.data.ensemble && message.data.metaLearning && message.data.reinforcementLearning) {
          setTrainingStatus(message.data);
        } else {
          console.log('🔍 Batch training message without full structure, ignoring:', message.type, message.data);
        }
        break;
      default:
        console.log('Unknown WebSocket message type:', message.type);
    }
  };

  // WebSocket соединение
  useEffect(() => {
    let isConnecting = false;
    let mounted = true;
    
    const connectWebSocket = () => {
      if (!mounted || isConnecting || socket) {
        return;
      }
      
      isConnecting = true;
      
      try {
        const ws = new WebSocket('ws://localhost:3001/');
        
        ws.onopen = () => {
          if (!mounted) return;
          setIsConnected(true);
          setReconnectAttempts(0);
          setError(null);
          isConnecting = false;
        };
        
        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
        
        ws.onclose = (event) => {
          if (!mounted) return;
          console.log(`🔌 WebSocket disconnected (code: ${event.code}, reason: ${event.reason})`);
          setIsConnected(false);
          setSocket(null);
          isConnecting = false;
          
          // Переподключение только если это не было намеренное закрытие
          if (event.code !== 1000 && event.code !== 1001 && reconnectAttempts < 3) {
            const delay = Math.min(2000 * Math.pow(2, reconnectAttempts), 10000);
            console.log(`⏳ Reconnecting in ${delay}ms... (attempt ${reconnectAttempts + 1}/3)`);
            
            const timeout = setTimeout(() => {
              if (mounted) {
                setReconnectAttempts(prev => prev + 1);
                connectWebSocket();
              }
            }, delay);
            setReconnectTimeout(timeout);
          } else if (reconnectAttempts >= 3) {
            console.error('❌ Max reconnection attempts reached');
            setError('Не удалось подключиться к серверу');
          }
        };
        
        ws.onerror = (error) => {
          if (!mounted) return;
          console.error('❌ WebSocket error:', error);
          // Не устанавливаем ошибку сразу, даем время на переподключение
          isConnecting = false;
        };
        
        setSocket(ws);
      } catch (error) {
        console.error('❌ Error creating WebSocket:', error);
        setError('Ошибка создания WebSocket соединения');
        isConnecting = false;
      }
    };
    
    connectWebSocket();
    
    return () => {
      mounted = false;
      if (socket) {
        socket.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [reconnectAttempts]); // Возвращаем зависимость от reconnectAttempts

  // Метод для ручного переподключения
  const reconnect = () => {
    if (socket) {
      socket.close();
    }
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    setReconnectAttempts(0);
    setError(null);
  };

  const contextValue: WebSocketDataContextType = {
    isConnected,
    error,
    systemStatus,
    cacheStatus,
    systemResources,
    tradingStats,
    performanceMetrics,
    trainingStatus,
    analysisStatus,
    reconnect
  };

  return (
    <WebSocketDataContext.Provider value={contextValue}>
      {children}
    </WebSocketDataContext.Provider>
  );
};

// Хук для использования WebSocket данных
export const useWebSocketData = () => {
  const context = useContext(WebSocketDataContext);
  if (context === undefined) {
    throw new Error('useWebSocketData must be used within a WebSocketDataProvider');
  }
  return context;
};

export default WebSocketDataProvider;