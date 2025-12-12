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

  // Топ-рекомендации (по одной для каждой стратегии)
  recommendations?: {
    figi: string;
    ticker: string;
    name: string;
    recommendation: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    score: number;
    strategyType?: 'aggressive' | 'moderate' | 'conservative' | null;
    horizon?: 'shortTerm' | 'mediumTerm' | 'longTerm' | null;
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

export interface TradingSignal {
  figi: string;
  ticker: string;
  name: string;
  signalType: 'BUY' | 'SELL';
  confidence: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  strategy?: any;
  timestamp: string;
}

export interface Alert {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  title?: string;
  category?: string;
  timestamp: string;
  details?: any;
}

export interface ModelMetrics {
  modelType: string;
  instrument?: string;
  figi?: string;
  accuracy: number | null;
  mae: number | null;
  rmse: number | null;
  mape: number | null;
  sharpeRatio: number | null;
  winRate: number | null;
  totalPredictions: number;
  correctPredictions: number;
  marketComparison?: any;
  lastUpdated: string;
  timestamp: string;
}

export interface TrainingProgress {
  modelType: string;
  instrument?: string;
  currentEpoch: number;
  totalEpochs: number;
  loss: number | null;
  accuracy: number | null;
  valLoss: number | null;
  valAccuracy: number | null;
  eta: number | null;
  learningRate: number | null;
  speed: number | null;
  stage: string;
  timestamp: string;
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
  
  // Новые данные
  tradingSignals: TradingSignal[];
  alerts: Alert[];
  modelMetrics: ModelMetrics[];
  trainingProgress: TrainingProgress | null;
  
  // Методы
  reconnect: () => void;
  clearAlerts: () => void;
  clearTradingSignals: () => void;
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
  
  // Новые состояния для новых каналов
  const [tradingSignals, setTradingSignals] = useState<TradingSignal[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [modelMetrics, setModelMetrics] = useState<ModelMetrics[]>([]);
  const [trainingProgress, setTrainingProgress] = useState<TrainingProgress | null>(null);


  // Обработка WebSocket сообщений
  const handleWebSocketMessage = (message: any) => {
    // Валидация входящего сообщения
    if (!message || typeof message !== 'object') {
      console.warn('Invalid WebSocket message received:', message);
      return;
    }
    
    if (!message.type) {
      console.warn('WebSocket message missing type field:', message);
      return;
    }
    
    try {
      switch (message.type) {
        case 'system_status_update':
          if (message.data) {
            setSystemStatus(message.data);
          }
          break;
        case 'cache_status_update':
          if (message.data) {
            setCacheStatus(message.data);
          }
          break;
        case 'system_resources_update':
          if (message.data) {
            setSystemResources(message.data);
          }
          break;
        case 'trading_stats_update':
          if (message.data) {
            // Валидация структуры trading stats
            const stats = message.data;
            setTradingStats({
              portfolioValue: typeof stats.portfolioValue === 'number' ? stats.portfolioValue : 0,
              cash: typeof stats.cash === 'number' ? stats.cash : 0,
              totalPnL: typeof stats.totalPnL === 'number' ? stats.totalPnL : 0,
              winRate: typeof stats.winRate === 'number' ? stats.winRate : 0,
              totalTrades: typeof stats.totalTrades === 'number' ? stats.totalTrades : 0,
              successfulTrades: typeof stats.successfulTrades === 'number' ? stats.successfulTrades : 0,
              recommendations: Array.isArray(stats.recommendations) ? stats.recommendations : []
            });
          }
          break;
        case 'performance_metrics_update':
          if (message.data) {
            setPerformanceMetrics(message.data);
          }
          break;
        case 'training_status_update':
          if (message.data) {
            setTrainingStatus(message.data);
          }
          break;
      case 'analysis_status_update':
        if (message.data) {
          setAnalysisStatus(message.data);
        }
        break;
      case 'trading_signal':
        // Сохраняем торговые сигналы
        if (message.data) {
          const signal: TradingSignal = {
            figi: message.data.figi || '',
            ticker: message.data.ticker || '',
            name: message.data.name || '',
            signalType: message.data.signalType || 'BUY',
            confidence: typeof message.data.confidence === 'number' ? message.data.confidence : 0,
            entryPrice: typeof message.data.entryPrice === 'number' ? message.data.entryPrice : 0,
            stopLoss: message.data.stopLoss || null,
            takeProfit: message.data.takeProfit || null,
            strategy: message.data.strategy || null,
            timestamp: message.data.timestamp || message.timestamp || new Date().toISOString()
          };
          
          setTradingSignals(prev => [signal, ...prev.slice(0, 49)]); // Храним последние 50
          
          // Показываем уведомление для важных сигналов
          if (signal.confidence > 0.7) {
            console.log(`📊 Новый торговый сигнал: ${signal.signalType} ${signal.ticker} (уверенность: ${(signal.confidence * 100).toFixed(1)}%)`);
          }
        }
        break;
      case 'training_progress':
        // Сохраняем детальный прогресс обучения
        if (message.data) {
          const progress: TrainingProgress = {
            modelType: message.data.modelType || 'neural_network',
            instrument: message.data.instrument || null,
            currentEpoch: typeof message.data.currentEpoch === 'number' ? message.data.currentEpoch : 0,
            totalEpochs: typeof message.data.totalEpochs === 'number' ? message.data.totalEpochs : 0,
            loss: message.data.loss || null,
            accuracy: message.data.accuracy || null,
            valLoss: message.data.valLoss || null,
            valAccuracy: message.data.valAccuracy || null,
            eta: message.data.eta || null,
            learningRate: message.data.learningRate || null,
            speed: message.data.speed || null,
            stage: message.data.stage || 'training',
            timestamp: message.data.timestamp || message.timestamp || new Date().toISOString()
          };
          
          setTrainingProgress(progress);
          
          // Обновляем trainingStatus для совместимости
          const modelType = progress.modelType;
          const progressPercent = progress.totalEpochs > 0 
            ? (progress.currentEpoch / progress.totalEpochs) * 100 
            : 0;
          
          setTrainingStatus(prev => {
            const baseStatus = prev || {
              neuralNetwork: { isTraining: false, stage: 'idle', progress: 0 },
              ensemble: { isTraining: false, stage: 'idle', progress: 0 },
              metaLearning: { isTraining: false, stage: 'idle', progress: 0 },
              reinforcementLearning: { isTraining: false, stage: 'idle', progress: 0 }
            };
            
            return {
              ...baseStatus,
              [modelType]: {
                isTraining: true,
                stage: progress.stage,
                progress: progressPercent
              }
            };
          });
        }
        break;
      case 'alert':
        // Сохраняем системные алерты
        if (message.data) {
          const alert: Alert = {
            id: message.data.id || Date.now().toString(),
            type: message.data.type || 'info',
            severity: message.data.severity || 'medium',
            message: message.data.message || '',
            title: message.data.title || null,
            category: message.data.category || 'system',
            timestamp: message.data.timestamp || message.timestamp || new Date().toISOString(),
            details: message.data.details || null
          };
          
          setAlerts(prev => [alert, ...prev.slice(0, 99)]); // Храним последние 100
          
          // Логируем важные алерты
          if (alert.severity === 'high' || alert.severity === 'critical') {
            console.warn(`⚠️ Критический алерт: ${alert.message}`, alert);
          }
        }
        break;
      case 'model_metrics':
        // Сохраняем метрики моделей
        if (message.data) {
          const metrics: ModelMetrics = {
            modelType: message.data.modelType || 'neural_network',
            instrument: message.data.instrument || null,
            figi: message.data.figi || null,
            accuracy: message.data.accuracy || null,
            mae: message.data.mae || null,
            rmse: message.data.rmse || null,
            mape: message.data.mape || null,
            sharpeRatio: message.data.sharpeRatio || null,
            winRate: message.data.winRate || null,
            totalPredictions: typeof message.data.totalPredictions === 'number' ? message.data.totalPredictions : 0,
            correctPredictions: typeof message.data.correctPredictions === 'number' ? message.data.correctPredictions : 0,
            marketComparison: message.data.marketComparison || null,
            lastUpdated: message.data.lastUpdated || new Date().toISOString(),
            timestamp: message.data.timestamp || message.timestamp || new Date().toISOString()
          };
          
          // Обновляем или добавляем метрики для инструмента
          setModelMetrics(prev => {
            const existingIndex = prev.findIndex(m => m.figi === metrics.figi && m.modelType === metrics.modelType);
            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = metrics;
              return updated;
            } else {
              return [metrics, ...prev.slice(0, 49)]; // Храним последние 50
            }
          });
        }
        break;
      case 'error':
        console.error('WebSocket error received:', message.data);
        setError(message.data?.message || 'Unknown error');
        break;
      case 'portfolio_analysis_started':
      case 'analysis_started':
        // Начало анализа портфеля
        if (message.data) {
          setAnalysisStatus({
            isAnalyzing: true,
            lastRunAt: message.data.timestamp || new Date().toISOString()
          });
        }
        break;
      case 'portfolio_analysis_completed':
      case 'analysis_completed':
        // Завершение анализа портфеля
        if (message.data) {
          setAnalysisStatus({
            isAnalyzing: false,
            lastRunAt: message.data.analysisDate || message.data.timestamp || new Date().toISOString()
          });
        }
        break;
      case 'portfolio_analysis_error':
      case 'analysis_error':
        // Ошибка анализа портфеля
        if (message.data) {
          setAnalysisStatus({
            isAnalyzing: false,
            lastRunAt: new Date().toISOString()
          });
          // Также создаем алерт об ошибке
          const errorAlert: Alert = {
            id: `analysis_error_${Date.now()}`,
            type: 'error',
            severity: 'high',
            message: message.data.error || 'Ошибка при анализе портфеля',
            title: 'Ошибка анализа',
            category: 'analysis',
            timestamp: new Date().toISOString(),
            details: message.data
          };
          setAlerts(prev => [errorAlert, ...prev.slice(0, 99)]);
        }
        break;
      case 'batch_training_started':
      case 'meta_learning_batch_started':
      case 'rl_batch_started':
        // Начало обучения
        if (message.data && message.data.neuralNetwork && message.data.ensemble && message.data.metaLearning && message.data.reinforcementLearning) {
          setTrainingStatus(message.data);
        }
        break;
      case 'batch_training_completed':
      case 'meta_learning_batch_completed':
      case 'rl_batch_completed':
        // Завершение обучения
        if (message.data && message.data.neuralNetwork && message.data.ensemble && message.data.metaLearning && message.data.reinforcementLearning) {
          setTrainingStatus(message.data);
        }
        break;
      case 'batch_training_failed':
      case 'meta_learning_batch_failed':
      case 'rl_batch_failed':
        // Ошибка обучения
        if (message.data && message.data.neuralNetwork && message.data.ensemble && message.data.metaLearning && message.data.reinforcementLearning) {
          setTrainingStatus(message.data);
        }
        // Создаем алерт об ошибке обучения
        if (message.data?.error) {
          const trainingErrorAlert: Alert = {
            id: `training_error_${Date.now()}`,
            type: 'error',
            severity: 'high',
            message: message.data.error || 'Ошибка при обучении модели',
            title: 'Ошибка обучения',
            category: 'training',
            timestamp: new Date().toISOString(),
            details: message.data
          };
          setAlerts(prev => [trainingErrorAlert, ...prev.slice(0, 99)]);
        }
        break;
        default:
          // Логируем неизвестные типы сообщений для отладки
          console.log('Unknown WebSocket message type:', message.type);
          break;
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error, message);
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
          setIsConnected(false);
          setSocket(null);
          isConnecting = false;
          
          // Переподключение только если это не было намеренное закрытие
          if (event.code !== 1000 && event.code !== 1001 && reconnectAttempts < 3) {
            const delay = Math.min(2000 * Math.pow(2, reconnectAttempts), 10000);
            
            const timeout = setTimeout(() => {
              if (mounted) {
                setReconnectAttempts(prev => prev + 1);
                connectWebSocket();
              }
            }, delay);
            setReconnectTimeout(timeout);
          } else if (reconnectAttempts >= 3) {
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

  // Методы для очистки данных
  const clearAlerts = () => {
    setAlerts([]);
  };

  const clearTradingSignals = () => {
    setTradingSignals([]);
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
    tradingSignals,
    alerts,
    modelMetrics,
    trainingProgress,
    reconnect,
    clearAlerts,
    clearTradingSignals
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