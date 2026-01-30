import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import useWebSocket from '../hooks/useWebSocket';

interface WebSocketMessage {
  type: string;
  data?: any;
  channel?: string;
  timestamp?: string;
}

interface RealTimeData {
  systemStatus: any;
  performanceMetrics: any;
  tradingStats: any;
  neuralNetworkStatus: any;
  trainingProgress: any;
  recommendations: any[];
  alerts: any[];
  portfolioUpdates: any;
  tradingRequests: any[];
  cacheUpdate: any;
  cacheStatus: any;
  systemResources: any;
  batchTraining: any;
  metaLearningBatch: any;
  rlBatch: any;
  trainingStatus: any;
}

interface WebSocketContextType {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  realTimeData: RealTimeData;
  subscribe: (channel: string) => void;
  unsubscribe: (channel: string) => void;
  sendMessage: (message: any) => void;
  reconnect: () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

interface WebSocketProviderProps {
  children: ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const [realTimeData, setRealTimeData] = useState<RealTimeData>({
    systemStatus: null,
    performanceMetrics: null,
    tradingStats: null,
    neuralNetworkStatus: null,
    trainingProgress: null,
    recommendations: [],
    alerts: [],
    portfolioUpdates: null,
    tradingRequests: [],
    cacheUpdate: null,
    cacheStatus: null,
    systemResources: null,
    batchTraining: null,
    metaLearningBatch: null,
    rlBatch: null,
    trainingStatus: null
  });

  // Обработчик входящих сообщений
  const handleMessage = (message: WebSocketMessage) => {

    switch (message.type) {
      case 'status':
        setRealTimeData(prev => ({
          ...prev,
          systemStatus: message.data
        }));
        break;

      case 'neural_network_status':
        setRealTimeData(prev => ({
          ...prev,
          neuralNetworkStatus: message.data
        }));
        break;

      case 'training_progress':
        setRealTimeData(prev => ({
          ...prev,
          trainingProgress: message.data
        }));
        break;

      case 'performance_metrics':
      case 'metrics_response':
        setRealTimeData(prev => ({
          ...prev,
          performanceMetrics: message.data
        }));
        break;

      case 'trading_stats':
        setRealTimeData(prev => ({
          ...prev,
          tradingStats: message.data
        }));
        break;

      case 'recommendation':
        setRealTimeData(prev => ({
          ...prev,
          recommendations: [message.data, ...prev.recommendations.slice(0, 49)] // Храним последние 50
        }));
        break;

      case 'cache_update_started':
        setRealTimeData(prev => ({
          ...prev,
          cacheUpdate: {
            status: 'started',
            message: message.data.message,
            timestamp: message.data.timestamp
          }
        }));
        break;

      case 'cache_update_completed':
        setRealTimeData(prev => ({
          ...prev,
          cacheUpdate: {
            status: 'completed',
            message: message.data.message,
            duration: message.data.duration,
            totalUpdated: message.data.totalUpdated,
            timestamp: message.data.timestamp
          }
        }));
        break;

      case 'cache_update_failed':
        setRealTimeData(prev => ({
          ...prev,
          cacheUpdate: {
            status: 'failed',
            message: message.data.message,
            error: message.data.error,
            timestamp: message.data.timestamp
          }
        }));
        break;

      case 'batch_training_started':
        setRealTimeData(prev => ({
          ...prev,
          batchTraining: {
            status: 'started',
            instrumentsCount: message.data.instrumentsCount,
            timestamp: message.data.timestamp
          }
        }));
        break;

      case 'batch_training_completed':
        setRealTimeData(prev => ({
          ...prev,
          batchTraining: {
            status: 'completed',
            results: message.data.results,
            summary: message.data.summary,
            timestamp: message.data.timestamp
          }
        }));
        break;

      case 'batch_training_failed':
        setRealTimeData(prev => ({
          ...prev,
          batchTraining: {
            status: 'failed',
            error: message.data.error,
            timestamp: message.data.timestamp
          }
        }));
        break;

      case 'meta_learning_batch_started':
        setRealTimeData(prev => ({
          ...prev,
          metaLearningBatch: {
            status: 'started',
            instrumentsCount: message.data.instrumentsCount,
            timestamp: message.data.timestamp
          }
        }));
        break;

      case 'meta_learning_batch_completed':
        setRealTimeData(prev => ({
          ...prev,
          metaLearningBatch: {
            status: 'completed',
            summary: message.data.summary,
            timestamp: message.data.timestamp
          }
        }));
        break;

      case 'meta_learning_batch_failed':
        setRealTimeData(prev => ({
          ...prev,
          metaLearningBatch: {
            status: 'failed',
            error: message.data.error,
            timestamp: message.data.timestamp
          }
        }));
        break;

      case 'rl_batch_started':
        setRealTimeData(prev => ({
          ...prev,
          rlBatch: {
            status: 'started',
            instrumentsCount: message.data.instrumentsCount,
            timestamp: message.data.timestamp
          }
        }));
        break;

      case 'rl_batch_completed':
        setRealTimeData(prev => ({
          ...prev,
          rlBatch: {
            status: 'completed',
            summary: message.data.summary,
            timestamp: message.data.timestamp
          }
        }));
        break;

      case 'rl_batch_failed':
        setRealTimeData(prev => ({
          ...prev,
          rlBatch: {
            status: 'failed',
            error: message.data.error,
            timestamp: message.data.timestamp
          }
        }));
        break;

      case 'cache_status_update':
        setRealTimeData(prev => ({
          ...prev,
          cacheStatus: message.data
        }));
        break;

      case 'system_resources_update':
        setRealTimeData(prev => ({
          ...prev,
          systemResources: message.data
        }));
        break;

      case 'training_status_update':
        setRealTimeData(prev => ({
          ...prev,
          trainingStatus: message.data
        }));
        break;

      case 'alert':
        setRealTimeData(prev => ({
          ...prev,
          alerts: [message.data, ...prev.alerts.slice(0, 99)] // Храним последние 100
        }));
        break;

      case 'portfolio_update':
        setRealTimeData(prev => ({
          ...prev,
          portfolioUpdates: message.data
        }));
        break;

      case 'trading_request_update':
        setRealTimeData(prev => {
          const updatedRequests = [...prev.tradingRequests];
          const index = updatedRequests.findIndex(req => req.id === message.data.id);
          
          if (index >= 0) {
            updatedRequests[index] = message.data;
          } else {
            updatedRequests.unshift(message.data);
          }
          
          return {
            ...prev,
            tradingRequests: updatedRequests.slice(0, 100) // Храним последние 100
          };
        });
        break;

      case 'error':
        console.error('WebSocket error received:', message.data);
        setRealTimeData(prev => ({
          ...prev,
          alerts: [{
            id: Date.now(),
            type: 'error',
            message: message.data.message,
            timestamp: message.timestamp || new Date().toISOString()
          }, ...prev.alerts.slice(0, 99)]
        }));
        break;

      case 'subscribed':
        console.log(`✅ Subscribed to channel: ${message.channel}`);
        break;

      case 'unsubscribed':
        console.log(`❌ Unsubscribed from channel: ${message.channel}`);
        break;

      // События обновления опционных данных
      case 'options_data_update_completed':
        setRealTimeData(prev => ({
          ...prev,
          alerts: [{
            id: Date.now(),
            type: 'success',
            message: `Обновление опционных данных завершено: ${message.data?.result?.stats?.saved || 0} опционов сохранено`,
            timestamp: message.timestamp || new Date().toISOString()
          }, ...prev.alerts.slice(0, 99)]
        }));
        break;

      case 'options_data_update_error':
        setRealTimeData(prev => ({
          ...prev,
          alerts: [{
            id: Date.now(),
            type: 'error',
            message: `Ошибка обновления опционных данных: ${message.data?.error || 'Неизвестная ошибка'}`,
            timestamp: message.timestamp || new Date().toISOString()
          }, ...prev.alerts.slice(0, 99)]
        }));
        break;

      // События воркеров
      case 'worker_started':
      case 'worker_progress':
      case 'worker_completed':
      case 'worker_error':
      case 'worker_paused':
      case 'worker_resumed':
      case 'worker_status_update':
        // События воркеров обрабатываются компонентами напрямую через useWebSocket
        // Здесь можно добавить глобальную обработку, если нужно
        break;

      default:
        console.log('Unknown WebSocket message type:', message.type);
    }
  };

  // Обработчики подключения/отключения
  const handleConnect = () => {
    console.log('🟢 WebSocket connected - subscribing to channels');
    
    // Подписываемся на основные каналы
    const channels = [
      'system_status',
      'neural_network',
      'trading_stats',
      'performance_metrics',
      'recommendations',
      'alerts',
      'portfolio',
      'trading_requests'
    ];

    channels.forEach(channel => {
      subscribe(channel);
    });

    // Запрашиваем текущий статус
    sendMessage({ action: 'get_status' });
    sendMessage({ action: 'get_metrics' });
  };

  const handleDisconnect = () => {
    console.log('🔴 WebSocket disconnected');
  };

  const handleError = (error: Event) => {
    console.error('🔴 WebSocket error:', error);
  };

  // Инициализация WebSocket
  const {
    isConnected,
    isConnecting,
    error,
    sendMessage,
    subscribe,
    unsubscribe,
    reconnect
  } = useWebSocket({
    onMessage: handleMessage,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onError: handleError,
    autoConnect: true,
    reconnectInterval: 3000,
    maxReconnectAttempts: 10
  });

  // Периодический запрос обновлений (fallback)
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      sendMessage({ action: 'get_status' });
      sendMessage({ action: 'get_metrics' });
    }, 30000); // Каждые 30 секунд

    return () => clearInterval(interval);
  }, [isConnected]); // Убираем sendMessage из зависимостей

  const contextValue: WebSocketContextType = {
    isConnected,
    isConnecting,
    error,
    realTimeData,
    subscribe,
    unsubscribe,
    sendMessage,
    reconnect
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocketContext = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
};
