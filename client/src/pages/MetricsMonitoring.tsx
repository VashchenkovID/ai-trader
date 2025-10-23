import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { ProgressBar } from 'primereact/progressbar';
import { TabView, TabPanel } from 'primereact/tabview';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Chart } from 'primereact/chart';
import { Toast } from 'primereact/toast';
import { ToggleButton } from 'primereact/togglebutton';
import useWebSocket from '../hooks/useWebSocket';
import { apiService } from '../services/apiService';

interface MetricsMonitoringProps {
  className?: string;
}

interface SystemMetrics {
  timestamp: string;
  neuralNetwork?: {
    status: string;
    accuracy: number;
    loss: number;
    isTraining: boolean;
    trainingProgress: number;
  };
  ensemble?: {
    status: string;
    activeModels: number;
    totalModels: number;
    averageAccuracy: number;
  };
  reinforcementLearning?: {
    status: string;
    episodes: number;
    averageReward: number;
    epsilon: number;
  };
  metaLearning?: {
    status: string;
    adaptationCount: number;
    successRate: number;
  };
  trading?: {
    activeTrades: number;
    totalProfit: number;
    winRate: number;
    maxDrawdown: number;
  };
  performance?: {
    cpuUsage: number;
    memoryUsage: number;
    responseTime: number;
    uptime: number;
  };
}

interface Alert {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  timestamp: string;
  resolved: boolean;
}

const MetricsMonitoring: React.FC<MetricsMonitoringProps> = ({ className = '' }) => {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);
  const toast = useRef<Toast>(null);

  // WebSocket подключение
  const { isConnected } = useWebSocket({
    url: 'ws://localhost:3001',
    onMessage: (message) => {
      // Обработка сообщений WebSocket
      switch (message.type) {
        case 'metrics_update':
          setMetrics(message.data);
          break;
        case 'alert':
          setAlerts(prev => [message.data, ...prev.slice(0, 99)]);
          toast.current?.show({
            severity: message.data.type,
            summary: 'Уведомление',
            detail: message.data.message
          });
          break;
        case 'training_progress':
          setMetrics(prev => prev ? {
            ...prev,
            neuralNetwork: {
              ...prev.neuralNetwork,
              status: prev.neuralNetwork?.status || 'unknown',
              accuracy: prev.neuralNetwork?.accuracy || 0,
              loss: prev.neuralNetwork?.loss || 0,
              isTraining: message.data.isTraining,
              trainingProgress: message.data.progress
            }
          } : null);
          break;
      }
    }
  });

  // Загрузка данных
  const loadMetrics = useCallback(async () => {
    try {
      setLoading(true);
      const [systemResponse, performanceResponse, alertsResponse] = await Promise.all([
        apiService.getSystemStatus(),
        apiService.getPerformanceMetrics(),
        apiService.getAlerts()
      ]);

      // Обрабатываем ответ системы
      if (systemResponse) {
        // Преобразуем SystemStatus в SystemMetrics
        const adaptedMetrics: SystemMetrics = {
          timestamp: systemResponse.timestamp || new Date().toISOString(),
          neuralNetwork: systemResponse.neuralNetwork,
          ensemble: systemResponse.ensemble,
          // Добавляем заглушки для отсутствующих полей
          reinforcementLearning: {
            status: 'unknown',
            episodes: 0,
            averageReward: 0,
            epsilon: 0
          },
          metaLearning: {
            status: 'unknown',
            adaptationCount: 0,
            successRate: 0
          },
          trading: {
            activeTrades: 0,
            totalProfit: 0,
            winRate: 0,
            maxDrawdown: 0
          },
          performance: {
            cpuUsage: 0,
            memoryUsage: 0,
            responseTime: 0,
            uptime: 0
          }
        };
        setMetrics(adaptedMetrics);
      }

      // Обрабатываем метрики производительности
      if (performanceResponse) {
        setHistoricalData(prev => [...prev.slice(-50), {
          ...performanceResponse,
          timestamp: new Date().toISOString()
        }]);
      }

      // Обрабатываем алерты
      if (alertsResponse && Array.isArray(alertsResponse)) {
        setAlerts(alertsResponse);
      }
    } catch (error) {
      console.error('Error loading metrics:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось загрузить метрики'
      });
    } finally {
      setLoading(false);
    }
  }, []); // Пустой массив зависимостей, так как функция не зависит от внешних переменных


  // Автообновление
  useEffect(() => {
    if (isAutoRefresh) {
      const interval = setInterval(loadMetrics, 5000);
      return () => clearInterval(interval);
    }
  }, [isAutoRefresh, loadMetrics]);

  // Загрузка при монтировании
  useEffect(() => {
    loadMetrics();
  }, []);

  // Получение цвета статуса
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'running':
      case 'online':
        return 'success';
      case 'warning':
      case 'degraded':
        return 'warning';
      case 'error':
      case 'offline':
      case 'failed':
        return 'danger';
      default:
        return 'info';
    }
  };

  // Получение цвета алерта
  const getAlertColor = (type: string) => {
    switch (type) {
      case 'error': return 'danger';
      case 'warning': return 'warning';
      case 'success': return 'success';
      default: return 'info';
    }
  };

  // Форматирование времени
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}д ${hours}ч ${minutes}м`;
  };

  // Данные для графиков
  const performanceChartData = {
    labels: historicalData.map(d => new Date(d.timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: 'CPU (%)',
        data: historicalData.map(d => d.cpuUsage || 0),
        borderColor: '#42A5F5',
        backgroundColor: 'rgba(66, 165, 245, 0.1)',
        tension: 0.4
      },
      {
        label: 'Memory (%)',
        data: historicalData.map(d => d.memoryUsage || 0),
        borderColor: '#66BB6A',
        backgroundColor: 'rgba(102, 187, 106, 0.1)',
        tension: 0.4
      }
    ]
  };

  const tradingChartData = {
    labels: historicalData.map(d => new Date(d.timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: 'Прибыль (%)',
        data: historicalData.map(d => d.totalProfit || 0),
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        tension: 0.4
      },
      {
        label: 'Win Rate (%)',
        data: historicalData.map(d => d.winRate || 0),
        borderColor: '#FF9800',
        backgroundColor: 'rgba(255, 152, 0, 0.1)',
        tension: 0.4
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100
      }
    }
  };

  return (
    <div className={`metrics-monitoring ${className}`}>
      <Toast ref={toast} />
      
      {/* Заголовок */}
      <Card className="mb-4">
        <div className="flex justify-content-between align-items-center mb-3">
          <h2 className="m-0">📊 Метрики и мониторинг</h2>
          <div className="flex align-items-center gap-3">
            <ToggleButton
              checked={isAutoRefresh}
              onChange={(e) => setIsAutoRefresh(e.value)}
              onLabel="Автообновление"
              offLabel="Ручное"
            />
            <Badge 
              value={isConnected ? 'Подключено' : 'Отключено'}
              severity={isConnected ? 'success' : 'danger'}
            />
            <Button
              icon="pi pi-refresh"
              label="Обновить"
              loading={loading}
              onClick={loadMetrics}
              size="small"
            />
          </div>
        </div>
        
        {metrics && (
          <div className="text-center p-3 border-round surface-100">
            <div className="text-sm text-600 mb-2">Последнее обновление</div>
            <div className="text-lg font-bold text-primary">
              {new Date(metrics.timestamp).toLocaleString()}
            </div>
          </div>
        )}
      </Card>

      <TabView>
        {/* Общий обзор */}
        <TabPanel header="📈 Общий обзор" leftIcon="pi pi-chart-line">
          {metrics && (
            <div className="grid">
              {/* Статус системы */}
              <div className="col-12">
                <Card title="🔧 Статус системы">
                  <div className="grid">
                    <div className="col-12 md:col-3">
                      <div className="text-center p-3 border-round surface-100">
                        <div className="text-900 font-medium mb-2">Нейросеть</div>
                        <Badge 
                          value={metrics.neuralNetwork?.status || 'Неизвестно'}
                          severity={getStatusColor(metrics.neuralNetwork?.status || 'unknown')}
                        />
                        <div className="text-sm text-600 mt-2">
                          Точность: {((metrics.neuralNetwork?.accuracy || 0) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <div className="col-12 md:col-3">
                      <div className="text-center p-3 border-round surface-100">
                        <div className="text-900 font-medium mb-2">Ансамбль</div>
                        <Badge 
                          value={metrics.ensemble?.status || 'Неизвестно'}
                          severity={getStatusColor(metrics.ensemble?.status || 'unknown')}
                        />
                        <div className="text-sm text-600 mt-2">
                          Моделей: {metrics.ensemble?.activeModels}/{metrics.ensemble?.totalModels}
                        </div>
                      </div>
                    </div>
                    <div className="col-12 md:col-3">
                      <div className="text-center p-3 border-round surface-100">
                        <div className="text-900 font-medium mb-2">RL Агент</div>
                        <Badge 
                          value={metrics.reinforcementLearning?.status || 'Неизвестно'}
                          severity={getStatusColor(metrics.reinforcementLearning?.status || 'unknown')}
                        />
                        <div className="text-sm text-600 mt-2">
                          Эпизоды: {metrics.reinforcementLearning?.episodes || 0}
                        </div>
                      </div>
                    </div>
                    <div className="col-12 md:col-3">
                      <div className="text-center p-3 border-round surface-100">
                        <div className="text-900 font-medium mb-2">Meta-Learning</div>
                        <Badge 
                          value={metrics.metaLearning?.status || 'Неизвестно'}
                          severity={getStatusColor(metrics.metaLearning?.status || 'unknown')}
                        />
                        <div className="text-sm text-600 mt-2">
                          Адаптаций: {metrics.metaLearning?.adaptationCount || 0}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Производительность */}
              <div className="col-12 md:col-6">
                <Card title="⚡ Производительность системы">
                  <div className="grid">
                    <div className="col-6">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-500">
                          {metrics.performance?.cpuUsage?.toFixed(1) || 0}%
                        </div>
                        <div className="text-600">CPU</div>
                        <ProgressBar 
                          value={metrics.performance?.cpuUsage || 0} 
                          className="mt-2"
                        />
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-500">
                          {metrics.performance?.memoryUsage?.toFixed(1) || 0}%
                        </div>
                        <div className="text-600">Memory</div>
                        <ProgressBar 
                          value={metrics.performance?.memoryUsage || 0} 
                          className="mt-2"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4 grid">
                    <div className="col-6">
                      <div className="text-center">
                        <div className="text-lg font-bold text-orange-500">
                          {metrics.performance?.responseTime || 0}ms
                        </div>
                        <div className="text-sm text-600">Время отклика</div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="text-center">
                        <div className="text-lg font-bold text-purple-500">
                          {formatUptime(metrics.performance?.uptime || 0)}
                        </div>
                        <div className="text-sm text-600">Время работы</div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Торговые метрики */}
              <div className="col-12 md:col-6">
                <Card title="💰 Торговые метрики">
                  <div className="grid">
                    <div className="col-6">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-500">
                          {metrics.trading?.totalProfit?.toFixed(2) || 0}%
                        </div>
                        <div className="text-600">Общая прибыль</div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-500">
                          {((metrics.trading?.winRate || 0) * 100).toFixed(1)}%
                        </div>
                        <div className="text-600">Win Rate</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4 grid">
                    <div className="col-6">
                      <div className="text-center">
                        <div className="text-lg font-bold text-orange-500">
                          {metrics.trading?.activeTrades || 0}
                        </div>
                        <div className="text-sm text-600">Активные сделки</div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="text-center">
                        <div className="text-lg font-bold text-red-500">
                          {metrics.trading?.maxDrawdown?.toFixed(2) || 0}%
                        </div>
                        <div className="text-sm text-600">Макс. просадка</div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </TabPanel>

        {/* Графики производительности */}
        <TabPanel header="📊 Графики" leftIcon="pi pi-chart-bar">
          <div className="grid">
            <div className="col-12">
              <Card title="⚡ Производительность системы">
                <div style={{ height: '300px' }}>
                  <Chart type="line" data={performanceChartData} options={chartOptions} />
                </div>
              </Card>
            </div>
            <div className="col-12">
              <Card title="💰 Торговые показатели">
                <div style={{ height: '300px' }}>
                  <Chart type="line" data={tradingChartData} options={chartOptions} />
                </div>
              </Card>
            </div>
          </div>
        </TabPanel>

        {/* Алерты */}
        <TabPanel header="🚨 Алерты" leftIcon="pi pi-exclamation-triangle">
          <Card title="Системные уведомления">
            <DataTable 
              value={alerts} 
              paginator 
              rows={10}
              emptyMessage="Нет активных алертов"
            >
              <Column 
                field="type" 
                header="Тип" 
                body={(rowData) => (
                  <Badge 
                    value={rowData.type}
                    severity={getAlertColor(rowData.type)}
                  />
                )}
              />
              <Column field="message" header="Сообщение" />
              <Column 
                field="timestamp" 
                header="Время" 
                body={(rowData) => new Date(rowData.timestamp).toLocaleString()}
              />
              <Column 
                field="resolved" 
                header="Статус" 
                body={(rowData) => (
                  <Badge 
                    value={rowData.resolved ? 'Решен' : 'Активен'}
                    severity={rowData.resolved ? 'success' : 'warning'}
                  />
                )}
              />
            </DataTable>
          </Card>
        </TabPanel>

        {/* Обучение нейросети */}
        <TabPanel header="🧠 Обучение" leftIcon="pi pi-brain">
          {metrics?.neuralNetwork && (
            <Card title="Статус обучения нейросети">
              <div className="grid">
                <div className="col-12 md:col-6">
                  <div className="text-center p-4 border-round surface-100">
                    <div className="text-2xl font-bold text-primary mb-2">
                      {metrics.neuralNetwork.isTraining ? 'Обучение' : 'Ожидание'}
                    </div>
                    <div className="text-600 mb-3">
                      {metrics.neuralNetwork.isTraining ? 'Идет процесс обучения...' : 'Готов к обучению'}
                    </div>
                    {metrics.neuralNetwork.isTraining && (
                      <ProgressBar 
                        value={metrics.neuralNetwork.trainingProgress || 0}
                        className="mb-3"
                      />
                    )}
                    <div className="text-sm text-600">
                      Точность: {(metrics.neuralNetwork.accuracy * 100)?.toFixed(2)}%
                    </div>
                  </div>
                </div>
                <div className="col-12 md:col-6">
                  <div className="text-center p-4 border-round surface-100">
                    <div className="text-2xl font-bold text-orange-500 mb-2">
                      {metrics.neuralNetwork.loss?.toFixed(4) || 'N/A'}
                    </div>
                    <div className="text-600 mb-3">Loss</div>
                    <div className="text-sm text-600">
                      Прогресс: {metrics.neuralNetwork.trainingProgress || 0}%
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </TabPanel>
      </TabView>
    </div>
  );
};

export default MetricsMonitoring;
