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

interface MetaLearningManagerProps {
  className?: string;
}

interface MetaLearningStatus {
  isActive: boolean;
  isInitialized?: boolean; // Опциональное поле
  adaptationCount: number;
  successRate: number;
  lastAdaptation: string;
  currentTask: string;
  performance: number;
}

interface AdaptationHistory {
  id: string;
  timestamp: string;
  task: string;
  success: boolean;
  performance: number;
  duration: number;
}

const MetaLearningManager: React.FC<MetaLearningManagerProps> = ({ className = '' }) => {
  const [status, setStatus] = useState<MetaLearningStatus | null>(null);
  const [history, setHistory] = useState<AdaptationHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useRef<Toast>(null);

  // Загрузка статуса Meta-Learning
  const loadMetaLearningStatus = async () => {
    try {
      setRefreshing(true);
      
      // Получаем статус через stats endpoint
      const statsResponse = await apiService.getMetaLearningStats();
      
      // Обрабатываем ответ в разных форматах
      let statusData = null;
      if (statsResponse && typeof statsResponse === 'object') {
        if (statsResponse.success && statsResponse.data) {
          statusData = statsResponse.data;
        } else if (statsResponse.isActive !== undefined) {
          // Прямой объект данных
          statusData = statsResponse;
        } else if (statsResponse.data) {
          statusData = statsResponse.data;
        }
      }
      
      if (statusData) {
        setStatus({
          isActive: statusData.isActive || false,
          isInitialized: statusData.isInitialized || false,
          adaptationCount: statusData.adaptationCount || 0,
          successRate: statusData.successRate || 0,
          lastAdaptation: statusData.lastAdaptation || new Date().toISOString(),
          currentTask: statusData.currentTask || 'Нет активной задачи',
          performance: statusData.performance || 0
        });
      }
      
      // История пока не реализована на бэкенде, используем пустой массив
      setHistory([]);
    } catch (error: any) {
      console.error('Error loading meta-learning status:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: error?.response?.data?.message || error?.message || 'Не удалось загрузить статус Meta-Learning'
      });
      // Устанавливаем значения по умолчанию при ошибке
      setStatus({
        isActive: false,
        isInitialized: false,
        adaptationCount: 0,
        successRate: 0,
        lastAdaptation: new Date().toISOString(),
        currentTask: 'Нет данных',
        performance: 0
      });
      setHistory([]);
    } finally {
      setRefreshing(false);
    }
  };

  // Автоматическое обновление каждые 20 секунд
  useEffect(() => {
    loadMetaLearningStatus();
    const interval = setInterval(loadMetaLearningStatus, 20000);
    return () => clearInterval(interval);
  }, []);

  // Запуск адаптации
  const startAdaptation = async () => {
    try {
      setLoading(true);
      const response = await apiService.startMetaLearningAdaptation();
      
      if (response.success) {
        toast.current?.show({
          severity: 'success',
          summary: 'Успех',
          detail: 'Адаптация Meta-Learning запущена'
        });
        await loadMetaLearningStatus();
      }
    } catch (error) {
      console.error('Error starting adaptation:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось запустить адаптацию'
      });
    } finally {
      setLoading(false);
    }
  };

  // Остановка адаптации
  const stopAdaptation = async () => {
    try {
      setLoading(true);
      const response = await apiService.stopMetaLearningAdaptation();
      
      if (response.success) {
        toast.current?.show({
          severity: 'info',
          summary: 'Остановлено',
          detail: 'Адаптация Meta-Learning остановлена'
        });
        await loadMetaLearningStatus();
      }
    } catch (error) {
      console.error('Error stopping adaptation:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось остановить адаптацию'
      });
    } finally {
      setLoading(false);
    }
  };

  // Получение цвета статуса
  const getStatusColor = (isActive: boolean) => {
    return isActive ? 'success' : 'info';
  };

  // Получение текста статуса
  const getStatusText = (isActive: boolean) => {
    return isActive ? 'Активна' : 'Ожидание';
  };

  // Получение цвета успеха
  const getSuccessColor = (success: boolean) => {
    return success ? 'success' : 'danger';
  };

  // Данные для графика производительности
  const performanceChartData = {
    labels: history.slice(-10).map(h => new Date(h.timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: 'Производительность (%)',
        data: history.slice(-10).map(h => h.performance * 100),
        borderColor: '#42A5F5',
        backgroundColor: 'rgba(66, 165, 245, 0.1)',
        tension: 0.4
      }
    ]
  };

  // Данные для графика успешности
  const successChartData = {
    labels: ['Успешные', 'Неудачные'],
    datasets: [
      {
        data: [
          history.filter(h => h.success).length,
          history.filter(h => !h.success).length
        ],
        backgroundColor: ['#4CAF50', '#F44336'],
        borderWidth: 0
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
    <div className={`meta-learning-manager ${className}`}>
      <Toast ref={toast} />
      
      {/* Заголовок и действия */}
      <Card className="mb-4">
        <div className="flex justify-content-between align-items-center mb-3">
          <h3 className="m-0">🧠 Meta-Learning</h3>
          <div className="flex gap-2">
            <Button
              icon="pi pi-refresh"
              label="Обновить"
              loading={refreshing}
              onClick={loadMetaLearningStatus}
              size="small"
            />
            <Button
              icon="pi pi-stop"
              label="Остановить"
              loading={loading}
              onClick={stopAdaptation}
              disabled={!status?.isActive}
              size="small"
              severity="danger"
            />
            <Button
              icon="pi pi-play"
              label="Запустить адаптацию"
              loading={loading}
              onClick={startAdaptation}
              disabled={status?.isActive}
              size="small"
              severity="success"
            />
          </div>
        </div>
        
        {/* Статус Meta-Learning */}
        {status && (
          <div className="grid">
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-2xl font-bold text-primary mb-2">
                  <Badge 
                    value={getStatusText(status.isActive)}
                    severity={getStatusColor(status.isActive)}
                  />
                </div>
                <div className="text-600">Статус</div>
              </div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-2xl font-bold text-green-500">
                  {status.adaptationCount}
                </div>
                <div className="text-600">Адаптаций</div>
              </div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-2xl font-bold text-blue-500">
                  {(status.successRate * 100).toFixed(2)}%
                </div>
                <div className="text-600">Успешность</div>
              </div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-2xl font-bold text-orange-500">
                  {(status.performance * 100).toFixed(2)}%
                </div>
                <div className="text-600">Производительность</div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Текущая задача */}
      {status && status.isActive && (
        <Card title="🎯 Текущая задача" className="mb-4">
          <div className="grid">
            <div className="col-12 md:col-8">
              <div className="p-3 border-round surface-100">
                <div className="text-lg font-semibold mb-2">
                  {status.currentTask || 'Нет активной задачи'}
                </div>
                <div className="text-600">
                  Последняя адаптация: {new Date(status.lastAdaptation).toLocaleString()}
                </div>
              </div>
            </div>
            <div className="col-12 md:col-4">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-2xl font-bold text-primary mb-2">
                  {(status.performance * 100).toFixed(1)}%
                </div>
                <div className="text-600">Текущая производительность</div>
                <ProgressBar 
                  value={status.performance * 100}
                  className="mt-2"
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* История адаптаций */}
      <Card title="📚 История адаптаций" className="mb-4">
        <DataTable 
          value={history} 
          paginator 
          rows={10}
          emptyMessage="Нет данных об адаптациях"
        >
          <Column 
            field="timestamp" 
            header="Время" 
            body={(rowData) => new Date(rowData.timestamp).toLocaleString()}
            sortable
          />
          <Column 
            field="task" 
            header="Задача" 
            sortable
          />
          <Column 
            field="success" 
            header="Результат" 
            body={(rowData) => (
              <Badge 
                value={rowData.success ? 'Успех' : 'Неудача'}
                severity={getSuccessColor(rowData.success)}
              />
            )}
          />
          <Column 
            field="performance" 
            header="Производительность" 
            body={(rowData) => `${(rowData.performance * 100).toFixed(2)}%`}
            sortable
          />
          <Column 
            field="duration" 
            header="Длительность" 
            body={(rowData) => `${rowData.duration.toFixed(2)}с`}
            sortable
          />
        </DataTable>
      </Card>

      {/* Графики */}
      <div className="grid">
        <div className="col-12 md:col-8">
          <Card title="Производительность адаптаций">
            <div style={{ height: '300px' }}>
              <Chart type="line" data={performanceChartData} options={chartOptions} />
            </div>
          </Card>
        </div>
        <div className="col-12 md:col-4">
          <Card title="Успешность адаптаций">
            <div style={{ height: '300px' }}>
              <Chart type="doughnut" data={successChartData} options={chartOptions} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default MetaLearningManager;
