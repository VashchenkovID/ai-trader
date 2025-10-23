import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { TabView, TabPanel } from 'primereact/tabview';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { Toast } from 'primereact/toast';
import { useRef } from 'react';
import { apiService } from '../services/apiService';
import EnsembleManager from './neural-networks/EnsembleManager';
import MetaLearningManager from './neural-networks/MetaLearningManager';
import ReinforcementLearningManager from './neural-networks/ReinforcementLearningManager';
import NeuralNetworkStatus from './neural-networks/NeuralNetworkStatus';
import TrainingManager from './neural-networks/TrainingManager';

interface NeuralNetworkManagerProps {
  className?: string;
}

interface SystemStatus {
  neuralNetwork: any;
  websocket: any;
  tradingEngine: any;
  ensemble: any;
  timestamp: string;
}

const NeuralNetworkManager: React.FC<NeuralNetworkManagerProps> = ({ className = '' }) => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const toast = useRef<Toast>(null);

  // Загрузка статуса системы
  const loadSystemStatus = async () => {
    try {
      setRefreshing(true);
      const response = await apiService.getSystemStatus();
      if (response.success) {
        setSystemStatus(response.data);
      }
    } catch (error) {
      console.error('Error loading system status:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось загрузить статус системы'
      });
    } finally {
      setRefreshing(false);
    }
  };

  // Инициализация всех AI сервисов
  const initializeAllServices = async () => {
    try {
      setLoading(true);
      
      // Инициализируем интегрированный AI сервис
      await apiService.initializeAIService();
      
      toast.current?.show({
        severity: 'success',
        summary: 'Успех',
        detail: 'Все AI сервисы инициализированы'
      });
      
      // Обновляем статус
      await loadSystemStatus();
    } catch (error) {
      console.error('Error initializing services:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Ошибка инициализации AI сервисов'
      });
    } finally {
      setLoading(false);
    }
  };

  // Загрузка всех моделей
  const loadAllModels = async () => {
    try {
      setLoading(true);
      
      await apiService.loadAllModels();
      
      toast.current?.show({
        severity: 'success',
        summary: 'Успех',
        detail: 'Все модели загружены'
      });
      
      // Обновляем статус
      await loadSystemStatus();
    } catch (error) {
      console.error('Error loading models:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Ошибка загрузки моделей'
      });
    } finally {
      setLoading(false);
    }
  };

  // Сохранение всех моделей
  const saveAllModels = async () => {
    try {
      setLoading(true);
      
      await apiService.saveAllModels();
      
      toast.current?.show({
        severity: 'success',
        summary: 'Успех',
        detail: 'Все модели сохранены'
      });
    } catch (error) {
      console.error('Error saving models:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Ошибка сохранения моделей'
      });
    } finally {
      setLoading(false);
    }
  };

  // Автоматическое обновление статуса каждые 30 секунд
  useEffect(() => {
    loadSystemStatus();
    const interval = setInterval(loadSystemStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status: any) => {
    if (!status) return <Badge value="Неизвестно" severity="secondary" />;
    
    if (typeof status === 'string') {
      const statusMap: { [key: string]: 'success' | 'warning' | 'danger' | 'info' } = {
        'active': 'success',
        'training': 'warning',
        'off': 'danger',
        'initialized': 'info'
      };
      return <Badge value={status} severity={statusMap[status] || 'secondary'} />;
    }
    
    if (status.isActive) {
      return <Badge value="Активен" severity="success" />;
    } else if (status.isTraining) {
      return <Badge value="Обучение" severity="warning" />;
    } else {
      return <Badge value="Отключен" severity="danger" />;
    }
  };

  return (
    <div className={`neural-network-manager ${className}`}>
      <Toast ref={toast} />
      
      {/* Заголовок и основные действия */}
      <Card className="mb-4">
        <div className="flex justify-content-between align-items-center mb-3">
          <h2 className="m-0">🧠 Управление нейросетями</h2>
          <div className="flex gap-2">
            <Button
              icon="pi pi-refresh"
              label="Обновить"
              loading={refreshing}
              onClick={loadSystemStatus}
              size="small"
            />
            <Button
              icon="pi pi-download"
              label="Загрузить модели"
              loading={loading}
              onClick={loadAllModels}
              size="small"
              severity="info"
            />
            <Button
              icon="pi pi-save"
              label="Сохранить модели"
              loading={loading}
              onClick={saveAllModels}
              size="small"
              severity="warning"
            />
            <Button
              icon="pi pi-play"
              label="Инициализировать все"
              loading={loading}
              onClick={initializeAllServices}
              size="small"
              severity="success"
            />
          </div>
        </div>

        {/* Общий статус системы */}
        {systemStatus && (
          <div className="grid">
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-900 font-medium mb-2">Нейросеть</div>
                {getStatusBadge(systemStatus.neuralNetwork)}
              </div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-900 font-medium mb-2">WebSocket</div>
                {getStatusBadge(systemStatus.websocket)}
              </div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-900 font-medium mb-2">Торговый движок</div>
                {getStatusBadge(systemStatus.tradingEngine)}
              </div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-900 font-medium mb-2">Ансамбль</div>
                {getStatusBadge(systemStatus.ensemble)}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Основные вкладки */}
      <TabView>
        {/* Статус и мониторинг */}
        <TabPanel header="📊 Статус и мониторинг" leftIcon="pi pi-chart-line">
          <NeuralNetworkStatus />
        </TabPanel>

        {/* Обучение */}
        <TabPanel header="🎓 Обучение" leftIcon="pi pi-cog">
          <TrainingManager />
        </TabPanel>

        {/* Ансамбль нейросетей */}
        <TabPanel header="🎭 Ансамбль" leftIcon="pi pi-sitemap">
          <EnsembleManager />
        </TabPanel>

        {/* Meta-Learning */}
        <TabPanel header="🧠 Meta-Learning" leftIcon="pi pi-brain">
          <MetaLearningManager />
        </TabPanel>

        {/* Reinforcement Learning */}
        <TabPanel header="🤖 Reinforcement Learning" leftIcon="pi pi-android">
          <ReinforcementLearningManager />
        </TabPanel>
      </TabView>
    </div>
  );
};

export default NeuralNetworkManager;
