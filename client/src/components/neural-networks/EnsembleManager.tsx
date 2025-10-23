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

interface EnsembleManagerProps {
  className?: string;
}

interface EnsembleModel {
  name: string;
  type: 'LSTM' | 'CNN' | 'Transformer';
  status: 'active' | 'training' | 'idle' | 'error';
  accuracy: number;
  weight: number;
  lastUpdate: string;
  isTraining: boolean;
}

interface EnsembleMetrics {
  overallAccuracy: number;
  diversity: number;
  stability: number;
  performance: number;
}

const EnsembleManager: React.FC<EnsembleManagerProps> = ({ className = '' }) => {
  const [models, setModels] = useState<EnsembleModel[]>([]);
  const [metrics, setMetrics] = useState<EnsembleMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useRef<Toast>(null);

  // Загрузка данных ансамбля
  const loadEnsembleData = async () => {
    try {
      setRefreshing(true);
      const [modelsResponse, metricsResponse] = await Promise.all([
        apiService.getEnsembleModels(),
        apiService.getEnsembleMetrics()
      ]);

      if (modelsResponse.success) {
        setModels(modelsResponse.data || []);
      }

      if (metricsResponse.success) {
        setMetrics(metricsResponse.data);
      }
    } catch (error) {
      console.error('Error loading ensemble data:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось загрузить данные ансамбля'
      });
    } finally {
      setRefreshing(false);
    }
  };

  // Автоматическое обновление каждые 15 секунд
  useEffect(() => {
    loadEnsembleData();
    const interval = setInterval(loadEnsembleData, 15000);
    return () => clearInterval(interval);
  }, []);

  // Обучение конкретной модели
  const trainModel = async (modelType: string) => {
    try {
      setLoading(true);
      const response = await apiService.trainEnsembleModel(modelType);
      
      if (response.success) {
        toast.current?.show({
          severity: 'success',
          summary: 'Успех',
          detail: `Обучение ${modelType} модели запущено`
        });
        await loadEnsembleData();
      }
    } catch (error) {
      console.error('Error training model:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось запустить обучение модели'
      });
    } finally {
      setLoading(false);
    }
  };

  // Обучение всех моделей
  const trainAllModels = async () => {
    try {
      setLoading(true);
      const response = await apiService.trainAllEnsembleModels();
      
      if (response.success) {
        toast.current?.show({
          severity: 'success',
          summary: 'Успех',
          detail: 'Обучение всех моделей запущено'
        });
        await loadEnsembleData();
      }
    } catch (error) {
      console.error('Error training all models:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось запустить обучение всех моделей'
      });
    } finally {
      setLoading(false);
    }
  };

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

  // Получение цвета типа модели
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'LSTM': return 'blue';
      case 'CNN': return 'green';
      case 'Transformer': return 'purple';
      default: return 'gray';
    }
  };

  // Данные для графика точности
  const accuracyChartData = {
    labels: models.map(m => m.name),
    datasets: [
      {
        label: 'Точность (%)',
        data: models.map(m => m.accuracy * 100),
        backgroundColor: models.map(m => {
          switch (m.type) {
            case 'LSTM': return 'rgba(66, 165, 245, 0.6)';
            case 'CNN': return 'rgba(76, 175, 80, 0.6)';
            case 'Transformer': return 'rgba(156, 39, 176, 0.6)';
            default: return 'rgba(158, 158, 158, 0.6)';
          }
        }),
        borderColor: models.map(m => {
          switch (m.type) {
            case 'LSTM': return '#42A5F5';
            case 'CNN': return '#4CAF50';
            case 'Transformer': return '#9C27B0';
            default: return '#9E9E9E';
          }
        }),
        borderWidth: 2
      }
    ]
  };

  // Данные для графика весов
  const weightChartData = {
    labels: models.map(m => m.name),
    datasets: [
      {
        label: 'Вес в ансамбле',
        data: models.map(m => m.weight * 100),
        backgroundColor: 'rgba(255, 152, 0, 0.6)',
        borderColor: '#FF9800',
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
    <div className={`ensemble-manager ${className}`}>
      <Toast ref={toast} />
      
      {/* Заголовок и действия */}
      <Card className="mb-4">
        <div className="flex justify-content-between align-items-center mb-3">
          <h3 className="m-0">🎭 Управление ансамблем нейросетей</h3>
          <div className="flex gap-2">
            <Button
              icon="pi pi-refresh"
              label="Обновить"
              loading={refreshing}
              onClick={loadEnsembleData}
              size="small"
            />
            <Button
              icon="pi pi-play"
              label="Обучить все"
              loading={loading}
              onClick={trainAllModels}
              size="small"
              severity="success"
            />
          </div>
        </div>
        
        {/* Общие метрики */}
        {metrics && (
          <div className="grid">
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-2xl font-bold text-primary">
                  {(metrics.overallAccuracy * 100).toFixed(2)}%
                </div>
                <div className="text-600">Общая точность</div>
              </div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-2xl font-bold text-green-500">
                  {(metrics.diversity * 100).toFixed(2)}%
                </div>
                <div className="text-600">Разнообразие</div>
              </div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-2xl font-bold text-orange-500">
                  {(metrics.stability * 100).toFixed(2)}%
                </div>
                <div className="text-600">Стабильность</div>
              </div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-2xl font-bold text-blue-500">
                  {(metrics.performance * 100).toFixed(2)}%
                </div>
                <div className="text-600">Производительность</div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Таблица моделей */}
      <Card title="Модели ансамбля" className="mb-4">
        <DataTable 
          value={models} 
          paginator 
          rows={10}
          emptyMessage="Нет данных о моделях"
        >
          <Column 
            field="name" 
            header="Название" 
            sortable
          />
          <Column 
            field="type" 
            header="Тип" 
            body={(rowData) => (
              <Badge 
                value={rowData.type}
                severity={getTypeColor(rowData.type) as any}
              />
            )}
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
            field="weight" 
            header="Вес" 
            body={(rowData) => `${(rowData.weight * 100).toFixed(2)}%`}
            sortable
          />
          <Column 
            field="isTraining" 
            header="Обучение" 
            body={(rowData) => (
              rowData.isTraining ? (
                <ProgressBar 
                  value={50}
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
          <Column 
            header="Действия" 
            body={(rowData) => (
              <Button
                icon="pi pi-play"
                size="small"
                onClick={() => trainModel(rowData.type)}
                loading={loading}
                disabled={rowData.isTraining}
                severity="success"
              />
            )}
          />
        </DataTable>
      </Card>

      {/* Графики */}
      <div className="grid">
        <div className="col-12 md:col-6">
          <Card title="Точность моделей">
            <div style={{ height: '300px' }}>
              <Chart type="bar" data={accuracyChartData} options={chartOptions} />
            </div>
          </Card>
        </div>
        <div className="col-12 md:col-6">
          <Card title="Веса в ансамбле">
            <div style={{ height: '300px' }}>
              <Chart type="doughnut" data={weightChartData} options={chartOptions} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default EnsembleManager;
