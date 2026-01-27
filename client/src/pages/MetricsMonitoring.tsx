import React, { useState, useEffect, useRef } from 'react';
import { Toast } from 'primereact/toast';
import { apiService, PerformanceMetrics } from '../services/apiService';
import { useWebSocketData } from '../components/WebSocketDataProvider';
import { TabView, TabPanel } from '../components/ui/TabView/TabView';
import { Card } from '../components/ui/Card/Card';
import { Skeleton } from '../components/ui/Skeleton/Skeleton';
import HeroMetricsCard from '../components/dashboard/HeroMetricsCard/HeroMetricsCard.tsx';
import AdvancedMetrics from '../components/AdvancedMetrics';
import './MetricsMonitoring.css';

interface MetricsMonitoringProps {
  className?: string;
}

interface MetricCardData {
  title: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
  description?: string;
}

const MetricsMonitoring: React.FC<MetricsMonitoringProps> = ({ className = '' }) => {
  const { systemStatus, systemResources, tradingStats, isConnected } = useWebSocketData();
  const toast = useRef<Toast | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 секунд по умолчанию
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Загрузка метрик производительности
  const loadPerformanceMetrics = async () => {
    try {
      const metrics = await apiService.getPerformanceMetrics();
      setPerformanceMetrics(metrics);
    } catch (error) {
      console.error('Error loading performance metrics:', error);
      showToast('error', 'Ошибка загрузки метрик производительности');
    }
  };

  // Загрузка всех данных
  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadPerformanceMetrics()
      ]);
    } catch (error) {
      console.error('Error loading metrics data:', error);
      showToast('error', 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  // Автообновление
  useEffect(() => {
    loadAllData();

    if (autoRefresh) {
      const interval = setInterval(() => {
        loadPerformanceMetrics();
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  const showToast = (severity: 'success' | 'info' | 'warn' | 'error', message: string) => {
    if (toast.current) {
      toast.current.show({ severity, summary: message, life: 3000 });
    }
  };

  // Форматирование метрик для карточек
  const formatMetricCard = (title: string, value: any, unit: string = ''): MetricCardData => {
    let formattedValue: string | number = value;
    let change: number | undefined;
    const trend: 'up' | 'down' | 'neutral' = 'neutral';

    if (typeof value === 'number') {
      if (value >= 1000) {
        formattedValue = (value / 1000).toFixed(2) + 'K';
      } else {
        formattedValue = value.toFixed(2);
      }
    }

    return {
      title,
      value: `${formattedValue}${unit ? ' ' + unit : ''}`,
      change,
      trend,
      description: ''
    };
  };

  // Метрики системы
  const systemMetrics: MetricCardData[] = systemResources ? [
    {
      title: 'Использование CPU',
      value: `${systemResources.cpu?.usage?.toFixed(1) || 0}%`,
      description: `Ядер: ${systemResources.cpu?.cores || 0}`
    },
    {
      title: 'Использование памяти',
      value: `${systemResources.memory?.usage?.toFixed(1) || 0}%`,
      description: `${(systemResources.memory?.usage || 0 / 1024 / 1024 / 1024).toFixed(2)} GB / ${(systemResources.memory?.total || 0 / 1024 / 1024 / 1024).toFixed(2)} GB`
    }
  ] : [];

  // Метрики производительности API
  const apiMetrics: MetricCardData[] = performanceMetrics ? [
    formatMetricCard('Время отклика', performanceMetrics.responseTime, 'ms'),
    formatMetricCard('Пропускная способность', performanceMetrics.throughput, 'req/s'),
    formatMetricCard('Процент ошибок', performanceMetrics.errorRate, '%'),
    formatMetricCard('Hit rate кеша', performanceMetrics.cacheHitRate, '%')
  ] : [];

  // Метрики торговли
  const tradingMetrics: MetricCardData[] = tradingStats ? [
    {
      title: 'Стоимость портфеля',
      value: `${(tradingStats.portfolioValue || 0).toLocaleString('ru-RU')} ₽`,
      description: `Наличные: ${(tradingStats.cash || 0).toLocaleString('ru-RU')} ₽`
    },
    {
      title: 'Общая прибыль/убыток',
      value: `${(tradingStats.totalPnL || 0).toLocaleString('ru-RU')} ₽`,
      trend: (tradingStats.totalPnL || 0) >= 0 ? 'up' : 'down'
    },
    {
      title: 'Win Rate',
      value: `${((tradingStats.winRate || 0) * 100).toFixed(1)}%`,
      description: `${tradingStats.successfulTrades || 0} / ${tradingStats.totalTrades || 0} сделок`
    }
  ] : [];

  return (
    <div className={`metrics-monitoring-page ${className}`}>
      <Toast ref={toast} />
      
      <div className="page-header mb-4">
        <h1 className="text-3xl font-bold">Мониторинг метрик</h1>
        <p className="text-gray-600 mt-2">
          Отслеживание производительности системы, торговых метрик и состояния сервисов
        </p>
      </div>

      {/* Статус подключения */}
      <div className="mb-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="font-medium">
                WebSocket: {isConnected ? 'Подключен' : 'Отключен'}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">Автообновление</span>
              </label>
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                className="px-3 py-1 border rounded text-sm"
                disabled={!autoRefresh}
              >
                <option value={10000}>10 сек</option>
                <option value={30000}>30 сек</option>
                <option value={60000}>1 мин</option>
                <option value={300000}>5 мин</option>
              </select>
            </div>
          </div>
        </Card>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-4">
              <Skeleton height="100px" />
            </Card>
          ))}
        </div>
      ) : (
        <TabView>
          {/* Вкладка: Обзор метрик */}
          <TabPanel header="Обзор">
            <div className="space-y-6">
              {/* Метрики системы */}
              {systemMetrics.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold mb-4">Метрики системы</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {systemMetrics.map((metric, index) => (
                      <Card key={index} className="p-4">
                        <div className="mb-2">
                          <p className="text-sm text-gray-600">{metric.title}</p>
                          <p className="text-2xl font-bold mt-1">{metric.value}</p>
                          {metric.description && (
                            <p className="text-xs text-gray-500 mt-1">{metric.description}</p>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Метрики производительности API */}
              {apiMetrics.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold mb-4">Производительность API</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {apiMetrics.map((metric, index) => (
                      <Card key={index} className="p-4">
                        <div className="mb-2">
                          <p className="text-sm text-gray-600">{metric.title}</p>
                          <p className="text-2xl font-bold mt-1">{metric.value}</p>
                          {metric.description && (
                            <p className="text-xs text-gray-500 mt-1">{metric.description}</p>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Метрики торговли */}
              {tradingMetrics.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold mb-4">Торговые метрики</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {tradingMetrics.map((metric, index) => (
                      <Card key={index} className="p-4">
                        <div className="mb-2">
                          <p className="text-sm text-gray-600">{metric.title}</p>
                          <p className={`text-2xl font-bold mt-1 ${
                            metric.trend === 'up' ? 'text-green-600' : 
                            metric.trend === 'down' ? 'text-red-600' : ''
                          }`}>
                            {metric.value}
                          </p>
                          {metric.description && (
                            <p className="text-xs text-gray-500 mt-1">{metric.description}</p>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Hero Metrics Card */}
              <div>
                <h2 className="text-xl font-semibold mb-4">Ключевые метрики</h2>
                <HeroMetricsCard tradingStats={tradingStats} />
              </div>
            </div>
          </TabPanel>

          {/* Вкладка: Нейросети */}
          <TabPanel header="Нейросети">
            <div className="space-y-4">
              {systemStatus?.neuralNetwork ? (
                <Card className="p-4">
                  <h3 className="text-lg font-semibold mb-4">Статус нейросетей</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Статус:</span>
                      <span className="font-medium">
                        {systemStatus.neuralNetwork.isLoaded ? 'Загружена' : 'Не загружена'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Обучение:</span>
                      <span className="font-medium">
                        {systemStatus.neuralNetwork.isTraining ? 'В процессе' : 'Не обучается'}
                      </span>
                    </div>
                    {systemStatus.neuralNetwork.accuracy && (
                      <div className="flex justify-between">
                        <span>Точность:</span>
                        <span className="font-medium">
                          {(systemStatus.neuralNetwork.accuracy * 100).toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
              ) : (
                <Card className="p-4">
                  <p className="text-gray-500">Данные о нейросетях недоступны</p>
                </Card>
              )}

              {systemStatus?.ensemble && (
                <Card className="p-4">
                  <h3 className="text-lg font-semibold mb-4">Ансамбль моделей</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Статус:</span>
                      <span className="font-medium">
                        {systemStatus.ensemble.isInitialized ? 'Инициализирован' : 'Не инициализирован'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Активен:</span>
                      <span className="font-medium">
                        {systemStatus.ensemble.isActive ? 'Да' : 'Нет'}
                      </span>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </TabPanel>

          {/* Вкладка: Торговля */}
          <TabPanel header="Торговля">
            <div className="space-y-4">
              {tradingStats ? (
                <>
                  <Card className="p-4">
                    <h3 className="text-lg font-semibold mb-4">Статистика торговли</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Всего сделок</p>
                        <p className="text-2xl font-bold">{tradingStats.totalTrades || 0}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Успешных сделок</p>
                        <p className="text-2xl font-bold text-green-600">
                          {tradingStats.successfulTrades || 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Win Rate</p>
                        <p className="text-2xl font-bold">
                          {((tradingStats.winRate || 0) * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Общая прибыль</p>
                        <p className={`text-2xl font-bold ${
                          (tradingStats.totalPnL || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {(tradingStats.totalPnL || 0).toLocaleString('ru-RU')} ₽
                        </p>
                      </div>
                    </div>
                  </Card>
                </>
              ) : (
                <Card className="p-4">
                  <p className="text-gray-500">Данные о торговле недоступны</p>
                </Card>
              )}
            </div>
          </TabPanel>

          {/* Вкладка: Система */}
          <TabPanel header="Система">
            <div className="space-y-4">
              {systemResources && (
                <Card className="p-4">
                  <h3 className="text-lg font-semibold mb-4">Ресурсы системы</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span>CPU</span>
                        <span className="font-medium">
                          {systemResources.cpu?.usage?.toFixed(1) || 0}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${systemResources.cpu?.usage || 0}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Ядер: {systemResources.cpu?.cores || 0}
                      </p>
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span>Память</span>
                        <span className="font-medium">
                          {systemResources.memory?.usage?.toFixed(1) || 0}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full"
                          style={{ width: `${systemResources.memory?.usage || 0}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Использовано: {((systemResources.memory?.usage || 0) / 1024 / 1024 / 1024).toFixed(2)} GB /
                        Всего: {((systemResources.memory?.total || 0) / 1024 / 1024 / 1024).toFixed(2)} GB
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {systemStatus && (
                <Card className="p-4">
                  <h3 className="text-lg font-semibold mb-4">Статус сервисов</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>База данных:</span>
                      <span className={`font-medium ${
                        systemStatus.database?.status === 'connected' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {systemStatus.database?.status === 'connected' ? 'Подключена' : 'Отключена'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>WebSocket:</span>
                      <span className={`font-medium ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                        {isConnected ? 'Подключен' : 'Отключен'}
                      </span>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </TabPanel>

          {/* Вкладка: Продвинутые метрики */}
          <TabPanel header="Продвинутые метрики">
            <AdvancedMetrics />
          </TabPanel>
        </TabView>
      )}
    </div>
  );
};

export default MetricsMonitoring;
