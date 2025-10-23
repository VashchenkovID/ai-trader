import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { ProgressBar } from 'primereact/progressbar';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Chart } from 'primereact/chart';
import { Toast } from 'primereact/toast';
import { useRef } from 'react';
import { apiService } from '../../services/apiService';

interface NeuralNetworkStatusProps {
  className?: string;
}

interface NetworkStatus {
  name: string;
  status: 'active' | 'training' | 'idle' | 'error';
  accuracy: number;
  loss: number;
  epoch: number;
  totalEpochs: number;
  lastUpdate: string;
  isTraining: boolean;
}

const NeuralNetworkStatus: React.FC<NeuralNetworkStatusProps> = ({ className = '' }) => {
  const [networks, setNetworks] = useState<NetworkStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useRef<Toast>(null);

  // Загрузка статуса нейросетей
  const loadNetworkStatus = async () => {
    try {
      setRefreshing(true);
      const response = await apiService.getNeuralNetworkStatus();
      if (response.success) {
        setNetworks(response.data || []);
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

  // Получение цвета статуса
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'training': return 'warning';
      case 'idle': return 'info';
      case 'error': return 'danger';
      default: return 'secondary';
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
    labels: networks.map(n => n.name),
    datasets: [
      {
        label: 'Точность (%)',
        data: networks.map(n => n.accuracy * 100),
        backgroundColor: 'rgba(66, 165, 245, 0.6)',
        borderColor: '#42A5F5',
        borderWidth: 2
      }
    ]
  };

  // Данные для графика потерь
  const lossChartData = {
    labels: networks.map(n => n.name),
    datasets: [
      {
        label: 'Потери',
        data: networks.map(n => n.loss),
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
        <div className="grid">
          <div className="col-12 md:col-3">
            <div className="text-center p-3 border-round surface-100">
              <div className="text-2xl font-bold text-primary">
                {networks.length}
              </div>
              <div className="text-600">Всего сетей</div>
            </div>
          </div>
          <div className="col-12 md:col-3">
            <div className="text-center p-3 border-round surface-100">
              <div className="text-2xl font-bold text-green-500">
                {networks.filter(n => n.status === 'active').length}
              </div>
              <div className="text-600">Активных</div>
            </div>
          </div>
          <div className="col-12 md:col-3">
            <div className="text-center p-3 border-round surface-100">
              <div className="text-2xl font-bold text-orange-500">
                {networks.filter(n => n.status === 'training').length}
              </div>
              <div className="text-600">Обучается</div>
            </div>
          </div>
          <div className="col-12 md:col-3">
            <div className="text-center p-3 border-round surface-100">
              <div className="text-2xl font-bold text-red-500">
                {networks.filter(n => n.status === 'error').length}
              </div>
              <div className="text-600">Ошибок</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Таблица статусов */}
      <Card title="Детальный статус" className="mb-4">
        <DataTable 
          value={networks} 
          paginator 
          rows={10}
          emptyMessage="Нет данных о нейросетях"
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
            body={(rowData) => `${(rowData.accuracy * 100).toFixed(2)}%`}
            sortable
          />
          <Column 
            field="loss" 
            header="Потери" 
            body={(rowData) => rowData.loss.toFixed(4)}
            sortable
          />
          <Column 
            field="epoch" 
            header="Эпоха" 
            body={(rowData) => `${rowData.epoch}/${rowData.totalEpochs}`}
          />
          <Column 
            field="isTraining" 
            header="Прогресс" 
            body={(rowData) => (
              rowData.isTraining ? (
                <ProgressBar 
                  value={(rowData.epoch / rowData.totalEpochs) * 100}
                  showValue={false}
                  className="w-full"
                />
              ) : (
                <span className="text-600">Завершено</span>
              )
            )}
          />
          <Column 
            field="lastUpdate" 
            header="Последнее обновление" 
            body={(rowData) => new Date(rowData.lastUpdate).toLocaleString()}
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
