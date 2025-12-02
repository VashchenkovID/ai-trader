import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { TabView, TabPanel } from 'primereact/tabview';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { Toast } from 'primereact/toast';
import { ProgressBar } from 'primereact/progressbar';
import { useRef } from 'react';
import { apiService } from '../services/apiService';
import { useWebSocketData } from './WebSocketDataProvider';
import EnsembleManager from './neural-networks/EnsembleManager';
import MetaLearningManager from './neural-networks/MetaLearningManager';
import ReinforcementLearningManager from './neural-networks/ReinforcementLearningManager';
import NeuralNetworkStatus from './neural-networks/NeuralNetworkStatus';
import TrainingManager from './neural-networks/TrainingManager';
import PredictionAnalysisPanel from './neural-networks/PredictionAnalysisPanel';

interface NeuralNetworkManagerProps {
  className?: string;
}

const NeuralNetworkManager: React.FC<NeuralNetworkManagerProps> = ({ className = '' }) => {
  const [neuralNetworkStatus, setNeuralNetworkStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const toast = useRef<Toast>(null);
  
  // WebSocket данные для real-time обновлений (как на дашборде)
  const { 
    trainingStatus, 
    systemStatus: wsSystemStatus,
    isConnected 
  } = useWebSocketData();

  // Загрузка статуса нейросети только при первой загрузке (fallback)
  useEffect(() => {
    const loadInitialStatus = async () => {
      try {
        const status = await apiService.getNeuralNetworkStatus();
        if (status && typeof status === 'object') {
          setNeuralNetworkStatus(status);
        }
      } catch (error) {
        console.warn('Error loading initial neural network status:', error);
      }
    };
    
    // Загружаем только если нет WebSocket данных
    if (!wsSystemStatus?.neuralNetwork) {
      loadInitialStatus();
    }
  }, []); // Только при монтировании

  // Инициализация всех AI сервисов
  const initializeAllServices = async () => {
    try {
      setLoading(true);
      
      // Активируем нейросеть
      try {
        const response = await fetch(`${(window as any).env?.REACT_APP_API_URL || 'http://localhost:3001'}/api/neural-network/activate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        if (response.ok) {
          toast.current?.show({
            severity: 'success',
            summary: 'Успех',
            detail: 'Нейросеть активирована'
          });
        }
      } catch (err) {
        console.warn('Could not activate neural network:', err);
      }
      
      // Статус обновится автоматически через WebSocket
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
      
      // Статус обновится автоматически через WebSocket
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

  // Обновление статуса нейросети из WebSocket (real-time)
  useEffect(() => {
    if (wsSystemStatus?.neuralNetwork && Object.keys(wsSystemStatus.neuralNetwork).length > 0) {
      setNeuralNetworkStatus(wsSystemStatus.neuralNetwork);
    }
  }, [wsSystemStatus]);

  // Функция определения статуса (как на дашборде)
  const getStatusBadge = (status: any) => {
    if (!status) return <Badge value="Неизвестно" severity="info" />;
    
    // Если это строка
    if (typeof status === 'string') {
      const statusMap: { [key: string]: 'success' | 'warning' | 'danger' | 'info' } = {
        'active': 'success',
        'ready': 'success',
        'training': 'warning',
        'off': 'danger',
        'not_loaded': 'danger',
        'initialized': 'info',
        'unknown': 'info',
        'connected': 'success',
        'inactive': 'warning'
      };
      return <Badge value={status} severity={statusMap[status] || 'info'} />;
    }
    
    // WebSocketService: {isConnected, clientsCount, isInitialized}
    if (status.hasOwnProperty('isConnected')) {
      if (status.isConnected && status.isInitialized) {
        const clientsText = status.clientsCount > 0 ? 
          `${status.clientsCount} клиент${status.clientsCount === 1 ? '' : status.clientsCount < 5 ? 'а' : 'ов'}` : 
          'готов';
        return <Badge value={`Активен (${clientsText})`} severity="success" />;
      } else {
        return <Badge value="Отключен" severity="danger" />;
      }
    }
    
    // EnsembleService: {isInitialized, isTraining, ...}
    if (status.hasOwnProperty('isInitialized')) {
      if (status.isTraining) {
        return <Badge value="Обучение" severity="warning" />;
      } else if (status.isInitialized) {
        const activeModels = status.activeModels || 0;
        const totalModels = status.totalModels || 0;
        return <Badge value={`Активен (${activeModels}/${totalModels})`} severity="success" />;
      } else {
        return <Badge value="Отключен" severity="danger" />;
      }
    }
    
    // NeuralNetworkService: {isActive, isTraining, isLoaded, ...}
    if (status.hasOwnProperty('isActive') || status.hasOwnProperty('isLoaded')) {
      if (status.isTraining) {
        return <Badge value="Обучение" severity="warning" />;
      } else if (status.isActive || status.isLoaded) {
        return <Badge value="Активен" severity="success" />;
      } else {
        return <Badge value="Отключен" severity="danger" />;
      }
    }
    
    // TradingEngine: {isActive, mode, ...}
    if (status.hasOwnProperty('mode')) {
      if (status.isActive) {
        return <Badge value={`Активен (${status.mode})`} severity="success" />;
      } else {
        return <Badge value={`Неактивен (${status.mode})`} severity="warning" />;
      }
    }
    
    // Fallback
    return <Badge value="Неизвестно" severity="info" />;
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
              onClick={() => {
                // Обновляем только нейросеть, остальное через WebSocket
                apiService.getNeuralNetworkStatus().then(setNeuralNetworkStatus).catch(console.error);
              }}
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

        {/* Общий статус системы (из WebSocket) */}
        {wsSystemStatus && (
          <div className="grid mb-4">
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-900 font-medium mb-2">Нейросеть</div>
                {getStatusBadge(wsSystemStatus.neuralNetwork)}
                {neuralNetworkStatus && (
                  <div className="mt-2 text-sm text-600">
                    {neuralNetworkStatus.isActive ? 'Активна' : 'Неактивна'}
                    {neuralNetworkStatus.accuracy && (
                      <div className="mt-1">
                        Точность: {(neuralNetworkStatus.accuracy * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-900 font-medium mb-2">WebSocket</div>
                {getStatusBadge(wsSystemStatus.websocket)}
                {!isConnected && (
                  <div className="mt-2 text-sm text-danger">
                    Соединение потеряно
                  </div>
                )}
              </div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-900 font-medium mb-2">Торговый движок</div>
                {getStatusBadge(wsSystemStatus.trading)}
              </div>
            </div>
            <div className="col-12 md:col-3">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-900 font-medium mb-2">Ансамбль</div>
                {(wsSystemStatus as any)?.ensemble ? (
                  getStatusBadge((wsSystemStatus as any).ensemble)
                ) : (
                  <Badge value="Загрузка..." severity="info" />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Детальная информация о нейросети */}
        {neuralNetworkStatus && (
          <div className="grid mb-4">
            {/* Карточка точности - показываем только если есть данные */}
            {(neuralNetworkStatus.accuracy !== null && 
              neuralNetworkStatus.accuracy !== undefined && 
              typeof neuralNetworkStatus.accuracy === 'number' && 
              !isNaN(neuralNetworkStatus.accuracy)) && (
              <div className="col-12 md:col-4">
                <Card className="h-full">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-primary mb-2">
                      {(neuralNetworkStatus.accuracy * 100).toFixed(1)}%
                    </div>
                    <div className="text-600 mb-3">Точность модели</div>
                    {neuralNetworkStatus.lastTraining && (
                      <div className="text-sm text-500">
                        Обучена: {new Date(neuralNetworkStatus.lastTraining).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            )}
            {/* Карточка возраста модели - показываем только если есть данные */}
            {(neuralNetworkStatus.modelAge !== null && 
              neuralNetworkStatus.modelAge !== undefined && 
              typeof neuralNetworkStatus.modelAge === 'number' && 
              !isNaN(neuralNetworkStatus.modelAge) &&
              neuralNetworkStatus.modelAge >= 0) && (
              <div className="col-12 md:col-4">
                <Card className="h-full">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-500 mb-2">
                      {Math.floor(neuralNetworkStatus.modelAge)} дн.
                    </div>
                    <div className="text-600 mb-3">Возраст модели</div>
                    {neuralNetworkStatus.isActive ? (
                      <Badge value="Активна" severity="success" />
                    ) : (
                      <Badge value="Неактивна" severity="info" />
                    )}
                  </div>
                </Card>
              </div>
            )}
            {/* Карточка статуса обучения - всегда показываем */}
            <div className="col-12 md:col-4">
              <Card className="h-full">
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-500 mb-2">
                    {trainingStatus?.neuralNetwork?.isTraining ? (
                      <>
                        {trainingStatus.neuralNetwork.progress || 0}%
                        <ProgressBar 
                          value={trainingStatus.neuralNetwork.progress || 0} 
                          className="mt-2"
                          showValue={false}
                        />
                      </>
                    ) : (
                      'Не обучается'
                    )}
                  </div>
                  <div className="text-600 mb-3">Статус обучения</div>
                  {trainingStatus?.neuralNetwork?.stage && (
                    <div className="text-sm text-500">
                      Этап: {trainingStatus.neuralNetwork.stage}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}
      </Card>

      {/* Основные вкладки */}
      <TabView>
        {/* Обзор - краткая сводка с основными метриками */}
        <TabPanel header="📊 Обзор" leftIcon="pi pi-home">
          <div className="grid">
            {neuralNetworkStatus && (
              <>
                {/* Краткая сводка */}
                <div className="col-12">
                  <Card title="📊 Краткая сводка" className="mb-4">
                    <div className="grid">
                      <div className="col-12 md:col-4">
                        <div className="text-center p-3 border-round surface-100">
                          <div className="text-2xl font-bold text-primary mb-2">
                            {neuralNetworkStatus.isLoaded ? 'Да' : 'Нет'}
                          </div>
                          <div className="text-600">Модель загружена</div>
                        </div>
                      </div>
                      <div className="col-12 md:col-4">
                        <div className="text-center p-3 border-round surface-100">
                          <div className="text-2xl font-bold text-green-500 mb-2">
                            {neuralNetworkStatus.isActive ? 'Активна' : 'Неактивна'}
                          </div>
                          <div className="text-600">Статус</div>
                        </div>
                      </div>
                      <div className="col-12 md:col-4">
                        <div className="text-center p-3 border-round surface-100">
                          <div className="text-2xl font-bold text-orange-500 mb-2">
                            {neuralNetworkStatus.isTraining ? 'Да' : 'Нет'}
                          </div>
                          <div className="text-600">Обучение</div>
                        </div>
                      </div>
                    </div>
                    {(neuralNetworkStatus.accuracy !== null && 
                      neuralNetworkStatus.accuracy !== undefined && 
                      typeof neuralNetworkStatus.accuracy === 'number' && 
                      !isNaN(neuralNetworkStatus.accuracy)) && (
                      <div className="grid mt-3">
                        <div className="col-12">
                          <div className="text-center p-3 border-round surface-100">
                            <div className="text-3xl font-bold text-primary mb-2">
                              {(neuralNetworkStatus.accuracy * 100).toFixed(1)}%
                            </div>
                            <div className="text-600">Точность модели</div>
                            {neuralNetworkStatus.lastTraining && (
                              <div className="text-sm text-500 mt-2">
                                Обучена: {new Date(neuralNetworkStatus.lastTraining).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                </div>
                {/* Быстрый анализ */}
                <div className="col-12">
                  <PredictionAnalysisPanel />
                </div>
              </>
            )}
            {!neuralNetworkStatus && (
              <div className="col-12">
                <Card>
                  <div className="text-center p-4">
                    <i className="pi pi-spin pi-spinner text-4xl text-primary mb-3"></i>
                    <p className="text-600">Загрузка данных...</p>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </TabPanel>

        {/* Статус и мониторинг - детальная информация с графиками и таблицами */}
        <TabPanel header="📈 Статус и мониторинг" leftIcon="pi pi-chart-line">
          <NeuralNetworkStatus />
        </TabPanel>

        {/* Обучение */}
        <TabPanel header="🎓 Обучение" leftIcon="pi pi-cog">
          <TrainingManager />
        </TabPanel>

        {/* Предсказания и анализ */}
        <TabPanel header="🔮 Предсказания" leftIcon="pi pi-eye">
          <PredictionAnalysisPanel />
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
