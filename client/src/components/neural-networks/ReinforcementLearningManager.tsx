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

interface ReinforcementLearningManagerProps {
  className?: string;
}

interface RLStatus {
  isActive: boolean;
  episodes: number;
  averageReward: number;
  epsilon: number;
  lastEpisode: string;
  currentAction: string;
  qValue: number;
}

interface EpisodeHistory {
  id: string;
  episode: number;
  reward: number;
  actions: number;
  duration: number;
  timestamp: string;
  success: boolean;
}

const ReinforcementLearningManager: React.FC<ReinforcementLearningManagerProps> = ({ className = '' }) => {
  const [status, setStatus] = useState<RLStatus | null>(null);
  const [history, setHistory] = useState<EpisodeHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useRef<Toast>(null);

  // Загрузка статуса RL
  const loadRLStatus = async () => {
    try {
      setRefreshing(true);
      
      // Получаем статус через stats endpoint
      const statsResponse = await apiService.getReinforcementLearningStats();
      
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
          episodes: statusData.episodes || 0,
          averageReward: statusData.averageReward || 0,
          epsilon: statusData.epsilon || 0.1,
          lastEpisode: statusData.lastEpisode || new Date().toISOString(),
          currentAction: statusData.currentAction || 'Нет данных',
          qValue: statusData.qValue || 0
        });
      }
      
      // История пока не реализована на бэкенде, используем пустой массив
      setHistory([]);
    } catch (error: any) {
      console.error('Error loading RL status:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: error?.response?.data?.message || error?.message || 'Не удалось загрузить статус RL'
      });
      // Устанавливаем значения по умолчанию при ошибке
      setStatus({
        isActive: false,
        isInitialized: false,
        episodes: 0,
        averageReward: 0,
        epsilon: 0.1,
        lastEpisode: new Date().toISOString(),
        currentAction: 'Нет данных',
        qValue: 0
      });
      setHistory([]);
    } finally {
      setRefreshing(false);
    }
  };

  // Автоматическое обновление каждые 5 секунд
  useEffect(() => {
    loadRLStatus();
    const interval = setInterval(loadRLStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Запуск обучения
  const startTraining = async () => {
    try {
      setLoading(true);
      const response = await apiService.startRLTraining();
      
      if (response.success) {
        toast.current?.show({
          severity: 'success',
          summary: 'Успех',
          detail: 'Обучение RL запущено'
        });
        await loadRLStatus();
      }
    } catch (error) {
      console.error('Error starting RL training:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось запустить обучение RL'
      });
    } finally {
      setLoading(false);
    }
  };

  // Остановка обучения
  const stopTraining = async () => {
    try {
      setLoading(true);
      const response = await apiService.stopRLTraining();
      
      if (response.success) {
        toast.current?.show({
          severity: 'info',
          summary: 'Остановлено',
          detail: 'Обучение RL остановлено'
        });
        await loadRLStatus();
      }
    } catch (error) {
      console.error('Error stopping RL training:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось остановить обучение RL'
      });
    } finally {
      setLoading(false);
    }
  };

  // Сброс агента
  const resetAgent = async () => {
    try {
      setLoading(true);
      const response = await apiService.resetRLAgent();
      
      if (response.success) {
        toast.current?.show({
          severity: 'success',
          summary: 'Успех',
          detail: 'RL агент сброшен'
        });
        await loadRLStatus();
      }
    } catch (error) {
      console.error('Error resetting RL agent:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось сбросить RL агента'
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
    return isActive ? 'Активен' : 'Ожидание';
  };

  // Получение цвета успеха
  const getSuccessColor = (success: boolean) => {
    return success ? 'success' : 'danger';
  };

  // Данные для графика наград
  const rewardChartData = {
    labels: history.slice(-20).map(h => h.episode),
    datasets: [
      {
        label: 'Награда',
        data: history.slice(-20).map(h => h.reward),
        borderColor: '#42A5F5',
        backgroundColor: 'rgba(66, 165, 245, 0.1)',
        tension: 0.4
      }
    ]
  };

  // Данные для графика Q-значений
  const qValueChartData = {
    labels: history.slice(-20).map(h => h.episode),
    datasets: [
      {
        label: 'Q-значение',
        data: history.slice(-20).map(h => h.actions),
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
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
        beginAtZero: true
      }
    }
  };

  return (
    <div className={`reinforcement-learning-manager ${className}`}>
      <Toast ref={toast} />
      
      {/* Заголовок и действия */}
      <Card className="mb-4">
        <div className="flex justify-content-between align-items-center mb-3">
          <h3 className="m-0">🤖 Reinforcement Learning</h3>
          <div className="flex gap-2">
            <Button
              icon="pi pi-refresh"
              label="Обновить"
              loading={refreshing}
              onClick={loadRLStatus}
              size="small"
            />
            <Button
              icon="pi pi-refresh"
              label="Сбросить агента"
              loading={loading}
              onClick={resetAgent}
              size="small"
              severity="warning"
            />
            <Button
              icon="pi pi-stop"
              label="Остановить"
              loading={loading}
              onClick={stopTraining}
              disabled={!status?.isActive}
              size="small"
              severity="danger"
            />
            <Button
              icon="pi pi-play"
              label="Запустить обучение"
              loading={loading}
              onClick={startTraining}
              disabled={status?.isActive}
              size="small"
              severity="success"
            />
          </div>
        </div>
        
        {/* Статус RL */}
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
                  {status.episodes}
                </div>
                <div className="text-600">Эпизоды</div>
              </div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-2xl font-bold text-blue-500">
                  {status.averageReward.toFixed(3)}
                </div>
                <div className="text-600">Средняя награда</div>
              </div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-2xl font-bold text-orange-500">
                  {status.epsilon.toFixed(3)}
                </div>
                <div className="text-600">Epsilon</div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Текущее состояние */}
      {status && status.isActive && (
        <Card title="🎯 Текущее состояние" className="mb-4">
          <div className="grid">
            <div className="col-12 md:col-6">
              <div className="p-3 border-round surface-100">
                <div className="text-lg font-semibold mb-2">
                  Текущее действие: {status.currentAction || 'Нет данных'}
                </div>
                <div className="text-600">
                  Q-значение: {status.qValue.toFixed(4)}
                </div>
              </div>
            </div>
            <div className="col-12 md:col-6">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-2xl font-bold text-primary mb-2">
                  {status.averageReward.toFixed(3)}
                </div>
                <div className="text-600 mb-3">Средняя награда</div>
                <ProgressBar 
                  value={Math.max(0, Math.min(100, (status.averageReward + 1) * 50))}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* История эпизодов */}
      <Card title="📚 История эпизодов" className="mb-4">
        <DataTable 
          value={history} 
          paginator 
          rows={10}
          emptyMessage="Нет данных об эпизодах"
        >
          <Column 
            field="episode" 
            header="Эпизод" 
            sortable
          />
          <Column 
            field="reward" 
            header="Награда" 
            body={(rowData) => rowData.reward.toFixed(3)}
            sortable
          />
          <Column 
            field="actions" 
            header="Действия" 
            sortable
          />
          <Column 
            field="duration" 
            header="Длительность" 
            body={(rowData) => `${rowData.duration.toFixed(2)}с`}
            sortable
          />
          <Column 
            field="success" 
            header="Успех" 
            body={(rowData) => (
              <Badge 
                value={rowData.success ? 'Да' : 'Нет'}
                severity={getSuccessColor(rowData.success)}
              />
            )}
          />
          <Column 
            field="timestamp" 
            header="Время" 
            body={(rowData) => new Date(rowData.timestamp).toLocaleString()}
            sortable
          />
        </DataTable>
      </Card>

      {/* Графики */}
      <div className="grid">
        <div className="col-12 md:col-6">
          <Card title="Награды по эпизодам">
            <div style={{ height: '300px' }}>
              <Chart type="line" data={rewardChartData} options={chartOptions} />
            </div>
          </Card>
        </div>
        <div className="col-12 md:col-6">
          <Card title="Q-значения по эпизодам">
            <div style={{ height: '300px' }}>
              <Chart type="line" data={qValueChartData} options={chartOptions} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ReinforcementLearningManager;
