import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { ProgressBar } from 'primereact/progressbar';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Chart } from 'primereact/chart';
import { Toast } from 'primereact/toast';
import { Divider } from 'primereact/divider';
import { useRef } from 'react';
import { apiService } from '../../services/apiService';
import { useWebSocketData } from '../WebSocketDataProvider';

interface NeuralNetworkStatusProps {
  className?: string;
}

interface NetworkStatus {
  name?: string;
  status?: 'active' | 'training' | 'idle' | 'error' | string;
  accuracy?: number;
  loss?: number;
  epoch?: number;
  totalEpochs?: number;
  lastUpdate?: string;
  lastTraining?: string;
  isTraining?: boolean;
  isActive?: boolean;
  isLoaded?: boolean;
  modelInputs?: number;
  modelAge?: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
}

const NeuralNetworkStatus: React.FC<NeuralNetworkStatusProps> = ({ className = '' }) => {
  const [networks, setNetworks] = useState<NetworkStatus[]>([]);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useRef<Toast>(null);
  const { systemStatus: wsSystemStatus } = useWebSocketData();

  // Загрузка статуса нейросетей
  const loadNetworkStatus = async () => {
    try {
      setRefreshing(true);
      const status = await apiService.getNeuralNetworkStatus();
      
      // Если это объект статуса, преобразуем в массив
      if (status && typeof status === 'object' && !Array.isArray(status)) {
        setNetworkStatus(status);
        // Создаем массив для совместимости со старым кодом
        setNetworks([{
          name: 'Основная нейросеть',
          status: status.isActive ? 'active' : (status.isTraining ? 'training' : 'idle'),
          accuracy: status.accuracy,
          isTraining: status.isTraining,
          isActive: status.isActive,
          isLoaded: status.isLoaded,
          lastUpdate: new Date().toISOString(),
          lastTraining: status.lastTraining,
          modelInputs: status.modelInputs,
          modelAge: status.modelAge
        }]);
      } else if (Array.isArray(status)) {
        setNetworks(status);
      }
    } catch (error) {
      console.error('Error loading network status:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось загрузить статус нейросетей'
      });
    } finally {
      setRefreshing(false);
    }
  };

  // Автоматическое обновление каждые 10 секунд
  useEffect(() => {
    loadNetworkStatus();
    const interval = setInterval(loadNetworkStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Обновление из WebSocket
  useEffect(() => {
    if (wsSystemStatus?.neuralNetwork && Object.keys(wsSystemStatus.neuralNetwork).length > 0) {
      const wsStatus = wsSystemStatus.neuralNetwork;
      // Обновляем статус с полными данными из WebSocket
      setNetworkStatus(wsStatus);
      // Также обновляем массив networks для совместимости
      setNetworks([{
        name: 'Основная нейросеть',
        status: wsStatus.isActive ? 'active' : (wsStatus.isTraining ? 'training' : 'idle'),
        accuracy: wsStatus.accuracy,
        loss: wsStatus.lastTrainingLoss,
        isTraining: wsStatus.isTraining,
        isActive: wsStatus.isActive,
        isLoaded: wsStatus.isLoaded,
        lastUpdate: new Date().toISOString(),
        lastTraining: wsStatus.lastTraining,
        modelInputs: wsStatus.modelInputs,
        modelAge: wsStatus.modelAge
      }]);
    }
  }, [wsSystemStatus]);

  // Получение цвета статуса
  const getStatusColor = (status: string): 'success' | 'warning' | 'danger' | 'info' => {
    switch (status) {
      case 'active': return 'success';
      case 'training': return 'warning';
      case 'idle': return 'info';
      case 'error': return 'danger';
      default: return 'info';
    }
  };

  // Получение текста статуса
  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Активна';
      case 'training': return 'Обучение';
      case 'idle': return 'Ожидание';
      case 'error': return 'Ошибка';
      default: return 'Неизвестно';
    }
  };

  // Данные для графика точности
  const accuracyChartData = {
    labels: networks.length > 0 ? networks.map(n => n.name || 'Нейросеть') : ['Основная модель'],
    datasets: [
      {
        label: 'Точность (%)',
        data: networks.length > 0 
          ? networks.map(n => (n.accuracy || 0) * 100)
          : networkStatus?.accuracy ? [networkStatus.accuracy * 100] : [0],
        backgroundColor: 'rgba(66, 165, 245, 0.6)',
        borderColor: '#42A5F5',
        borderWidth: 2
      }
    ]
  };

  // Данные для графика потерь
  const lossChartData = {
    labels: networks.length > 0 ? networks.map(n => n.name || 'Нейросеть') : ['Основная модель'],
    datasets: [
      {
        label: 'Потери',
        data: networks.length > 0
          ? networks.map(n => n.loss || 0)
          : networkStatus?.loss ? [networkStatus.loss] : [0],
        backgroundColor: 'rgba(244, 67, 54, 0.6)',
        borderColor: '#F44336',
        borderWidth: 2
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
    <div className={`neural-network-status ${className}`}>
      <Toast ref={toast} />
      
      {/* Заголовок и действия */}
      <Card className="mb-4">
        <div className="flex justify-content-between align-items-center mb-3">
          <h3 className="m-0">📊 Статус нейросетей</h3>
          <Button
            icon="pi pi-refresh"
            label="Обновить"
            loading={refreshing}
            onClick={loadNetworkStatus}
            size="small"
          />
        </div>
        
        {/* Общая статистика */}
        <div className="grid mb-4">
          <div className="col-12 md:col-3">
            <div className="text-center p-3 border-round surface-100">
              <div className="text-2xl font-bold text-primary">
                {networks.length || (networkStatus ? 1 : 0)}
              </div>
              <div className="text-600">Всего сетей</div>
            </div>
          </div>
          <div className="col-12 md:col-3">
            <div className="text-center p-3 border-round surface-100">
              <div className="text-2xl font-bold text-green-500">
                {networks.filter(n => n.status === 'active' || n.isActive).length || (networkStatus?.isActive ? 1 : 0)}
              </div>
              <div className="text-600">Активных</div>
            </div>
          </div>
          <div className="col-12 md:col-3">
            <div className="text-center p-3 border-round surface-100">
              <div className="text-2xl font-bold text-orange-500">
                {networks.filter(n => n.status === 'training' || n.isTraining).length || (networkStatus?.isTraining ? 1 : 0)}
              </div>
              <div className="text-600">Обучается</div>
            </div>
          </div>
          <div className="col-12 md:col-3">
            <div className="text-center p-3 border-round surface-100">
              <div className="text-2xl font-bold text-blue-500">
                {networks.filter(n => n.isLoaded).length || (networkStatus?.isLoaded ? 1 : 0)}
              </div>
              <div className="text-600">Загружено</div>
            </div>
          </div>
        </div>

        {/* Детальная информация о модели */}
        {networkStatus && (
          <div className="grid mb-4">
            {/* Карточка метрик - показываем только если есть хотя бы одна метрика */}
            {((networkStatus.accuracy !== null && 
               networkStatus.accuracy !== undefined && 
               typeof networkStatus.accuracy === 'number' && 
               !isNaN(networkStatus.accuracy)) ||
             (networkStatus.loss !== null && 
              networkStatus.loss !== undefined && 
              typeof networkStatus.loss === 'number' && 
              !isNaN(networkStatus.loss)) ||
             (networkStatus.precision !== undefined && 
              networkStatus.precision !== null && 
              typeof networkStatus.precision === 'number' && 
              !isNaN(networkStatus.precision)) || 
             (networkStatus.recall !== undefined && 
              networkStatus.recall !== null && 
              typeof networkStatus.recall === 'number' && 
              !isNaN(networkStatus.recall))) && (
              <div className="col-12 md:col-6">
                <Card title="📊 Метрики модели" className="h-full">
                  <div className="grid">
                    {networkStatus.accuracy !== null && 
                     networkStatus.accuracy !== undefined && 
                     typeof networkStatus.accuracy === 'number' && 
                     !isNaN(networkStatus.accuracy) && (
                      <div className="col-6">
                        <div className="text-center p-2 border-round surface-100">
                          <div className="text-xl font-bold text-primary mb-1">
                            {(networkStatus.accuracy * 100).toFixed(1)}%
                          </div>
                          <div className="text-sm text-600">Точность</div>
                        </div>
                      </div>
                    )}
                    {networkStatus.loss !== null && 
                     networkStatus.loss !== undefined && 
                     typeof networkStatus.loss === 'number' && 
                     !isNaN(networkStatus.loss) && (
                      <div className="col-6">
                        <div className="text-center p-2 border-round surface-100">
                          <div className="text-xl font-bold text-orange-500 mb-1">
                            {networkStatus.loss.toFixed(4)}
                          </div>
                          <div className="text-sm text-600">Потери</div>
                        </div>
                      </div>
                    )}
                    {networkStatus.precision !== undefined && 
                     networkStatus.precision !== null && 
                     typeof networkStatus.precision === 'number' && 
                     !isNaN(networkStatus.precision) && (
                      <div className="col-6">
                        <div className="text-center p-2 border-round surface-100">
                          <div className="text-xl font-bold text-green-500 mb-1">
                            {(networkStatus.precision * 100).toFixed(1)}%
                          </div>
                          <div className="text-sm text-600">Precision</div>
                        </div>
                      </div>
                    )}
                    {networkStatus.recall !== undefined && 
                     networkStatus.recall !== null && 
                     typeof networkStatus.recall === 'number' && 
                     !isNaN(networkStatus.recall) && (
                      <div className="col-6">
                        <div className="text-center p-2 border-round surface-100">
                          <div className="text-xl font-bold text-blue-500 mb-1">
                            {(networkStatus.recall * 100).toFixed(1)}%
                          </div>
                          <div className="text-sm text-600">Recall</div>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            )}
            {/* Карточка информации о модели - всегда показываем */}
            <div className={`col-12 ${((networkStatus.accuracy !== null && 
                                        networkStatus.accuracy !== undefined && 
                                        typeof networkStatus.accuracy === 'number' && 
                                        !isNaN(networkStatus.accuracy)) ||
                                       (networkStatus.loss !== null && 
                                        networkStatus.loss !== undefined && 
                                        typeof networkStatus.loss === 'number' && 
                                        !isNaN(networkStatus.loss)) ||
                                       (networkStatus.precision !== undefined && 
                                        networkStatus.precision !== null && 
                                        typeof networkStatus.precision === 'number' && 
                                        !isNaN(networkStatus.precision)) || 
                                       (networkStatus.recall !== undefined && 
                                        networkStatus.recall !== null && 
                                        typeof networkStatus.recall === 'number' && 
                                        !isNaN(networkStatus.recall))) ? 'md:col-6' : 'md:col-12'}`}>
              <Card title="ℹ️ Информация о модели" className="h-full">
                <div className="flex flex-column gap-2">
                  <div className="flex justify-content-between">
                    <span className="text-600">Статус:</span>
                    <Badge 
                      value={networkStatus.isActive ? 'Активна' : (networkStatus.isTraining ? 'Обучение' : 'Неактивна')}
                      severity={networkStatus.isActive ? 'success' : (networkStatus.isTraining ? 'warning' : 'info')}
                    />
                  </div>
                  <div className="flex justify-content-between">
                    <span className="text-600">Загружена:</span>
                    <span className="font-medium">{networkStatus.isLoaded ? 'Да' : 'Нет'}</span>
                  </div>
                  {networkStatus.modelInputs && networkStatus.modelInputs > 0 && (
                    <div className="flex justify-content-between">
                      <span className="text-600">Входов модели:</span>
                      <span className="font-medium">{networkStatus.modelInputs}</span>
                    </div>
                  )}
                  {networkStatus.modelAge !== undefined && 
                   networkStatus.modelAge !== null && 
                   typeof networkStatus.modelAge === 'number' && 
                   !isNaN(networkStatus.modelAge) &&
                   networkStatus.modelAge >= 0 && (
                    <div className="flex justify-content-between">
                      <span className="text-600">Возраст модели:</span>
                      <span className="font-medium">{Math.floor(networkStatus.modelAge)} дней</span>
                    </div>
                  )}
                  {networkStatus.lastTraining && (
                    <div className="flex justify-content-between">
                      <span className="text-600">Последнее обучение:</span>
                      <span className="font-medium text-sm">
                        {new Date(networkStatus.lastTraining).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}

        <Divider />
      </Card>

      {/* Таблица статусов */}
      <Card title="📋 Детальный статус" className="mb-4">
        <DataTable 
          value={networks} 
          paginator 
          rows={10}
          emptyMessage="Нет данных о нейросетях"
          loading={refreshing}
        >
          <Column 
            field="name" 
            header="Название" 
            sortable
          />
          <Column 
            field="status" 
            header="Статус" 
            body={(rowData) => (
              <Badge 
                value={getStatusText(rowData.status)}
                severity={getStatusColor(rowData.status)}
              />
            )}
          />
          <Column 
            field="accuracy" 
            header="Точность" 
            body={(rowData) => rowData.accuracy ? `${(rowData.accuracy * 100).toFixed(2)}%` : 'N/A'}
            sortable
          />
          <Column 
            field="loss" 
            header="Потери" 
            body={(rowData) => rowData.loss ? rowData.loss.toFixed(4) : 'N/A'}
            sortable
          />
          <Column 
            field="epoch" 
            header="Эпоха" 
            body={(rowData) => rowData.epoch && rowData.totalEpochs ? `${rowData.epoch}/${rowData.totalEpochs}` : 'N/A'}
          />
          <Column 
            field="isTraining" 
            header="Прогресс" 
            body={(rowData) => (
              rowData.isTraining && rowData.epoch && rowData.totalEpochs ? (
                <ProgressBar 
                  value={(rowData.epoch / rowData.totalEpochs) * 100}
                  showValue={false}
                  className="w-full"
                />
              ) : (
                <span className="text-600">Не обучается</span>
              )
            )}
          />
          <Column 
            field="isLoaded" 
            header="Загружена" 
            body={(rowData) => (
              <Badge 
                value={rowData.isLoaded ? 'Да' : 'Нет'} 
                severity={rowData.isLoaded ? 'success' : 'warning'}
              />
            )}
          />
          <Column 
            field="lastUpdate" 
            header="Последнее обновление" 
            body={(rowData) => rowData.lastUpdate ? new Date(rowData.lastUpdate).toLocaleString() : 'N/A'}
          />
        </DataTable>
      </Card>

      {/* Графики */}
      <div className="grid">
        <div className="col-12 md:col-6">
          <Card title="Точность нейросетей">
            <div style={{ height: '300px' }}>
              <Chart type="bar" data={accuracyChartData} options={chartOptions} />
            </div>
          </Card>
        </div>
        <div className="col-12 md:col-6">
          <Card title="Потери нейросетей">
            <div style={{ height: '300px' }}>
              <Chart type="bar" data={lossChartData} options={chartOptions} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default NeuralNetworkStatus;
