import { useWebSocketData } from '../components/WebSocketDataProvider';

// Хук для системного статуса
export const useSystemStatus = () => {
  const { systemStatus, isConnected, error } = useWebSocketData();
  return { systemStatus, isConnected, error };
};

// Хук для статуса кеша
export const useCacheStatus = () => {
  const { cacheStatus, isConnected, error } = useWebSocketData();
  return { cacheStatus, isConnected, error };
};

// Хук для системных ресурсов
export const useSystemResources = () => {
  const { systemResources, isConnected, error } = useWebSocketData();
  return { systemResources, isConnected, error };
};

// Хук для торговой статистики
export const useTradingStats = () => {
  const { tradingStats, isConnected, error } = useWebSocketData();
  return { tradingStats, isConnected, error };
};

// Хук для метрик производительности
export const usePerformanceMetrics = () => {
  const { performanceMetrics, isConnected, error } = useWebSocketData();
  return { performanceMetrics, isConnected, error };
};

// Хук для статуса обучения
export const useTrainingStatus = () => {
  const { trainingStatus, isConnected, error } = useWebSocketData();
  return { trainingStatus, isConnected, error };
};

// Хук для всех данных
export const useAllWebSocketData = () => {
  return useWebSocketData();
};
