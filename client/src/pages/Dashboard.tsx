import React, { useState, useEffect, useRef } from 'react';
import { Card } from 'primereact/card';
import { Badge } from 'primereact/badge';
import { Skeleton } from 'primereact/skeleton';
import { Message } from 'primereact/message';
import { Toast } from 'primereact/toast';
import { apiService } from '../services/apiService';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { useWebSocketData } from '../components/WebSocketDataProvider';
import CacheStatusCard from '../components/dashboard/CacheStatusCard';
import TradingSummaryCard from '../components/dashboard/TradingSummaryCard';
import NeuralNetworksControlCard from '../components/dashboard/NeuralNetworksControlCard';
import TradingSignalsWidget from '../components/websocket/TradingSignalsWidget';
import AlertsWidget from '../components/websocket/AlertsWidget';
import ModelMetricsWidget from '../components/websocket/ModelMetricsWidget';
import CachedSignalsCard from '../components/dashboard/CachedSignalsCard';
import TrainingProgressWidget from '../components/websocket/TrainingProgressWidget';

interface DashboardProps {
  className?: string;
}

// Интерфейсы теперь импортируются из WebSocketDataProvider

const Dashboard: React.FC<DashboardProps> = ({ className = '' }) => {
  // Используем новый WebSocket провайдер
  const { 
    systemStatus, 
    cacheStatus, 
    systemResources,
    tradingStats, 
    trainingStatus,
    trainingProgress,
    tradingSignals,
    alerts,
    modelMetrics,
    isConnected 
  } = useWebSocketData();
  
  // Локальное состояние
  const [error, setError] = useState<string | null>(null);
  const [trainLoading, setTrainLoading] = useState(false);
  const [trainingProgressText, setTrainingProgressText] = useState<string>('');
  const [trainingStage, setTrainingStage] = useState<string>('');
  const [trainingStages, setTrainingStages] = useState<{
    neuralNetwork: 'pending' | 'in_progress' | 'completed' | 'failed';
    ensemble: 'pending' | 'in_progress' | 'completed' | 'failed';
    metaLearning: 'pending' | 'in_progress' | 'completed' | 'failed';
    reinforcementLearning: 'pending' | 'in_progress' | 'completed' | 'failed';
  }>({
    neuralNetwork: 'pending',
    ensemble: 'pending',
    metaLearning: 'pending',
    reinforcementLearning: 'pending'
  });
  
  const toast = useRef<Toast>(null);
  const lastSignalRef = useRef<string>('');
  const lastAlertRef = useRef<string>('');

  // Обработка статуса обучения из WebSocket
  useEffect(() => {
    if (trainingStatus) {      
      // Обновляем локальное состояние на основе WebSocket данных
      setTrainingStages({
        neuralNetwork: trainingStatus.neuralNetwork.isTraining ? 'in_progress' : 
                      trainingStatus.neuralNetwork.stage === 'completed' ? 'completed' :
                      trainingStatus.neuralNetwork.stage === 'failed' ? 'failed' : 'pending',
        ensemble: trainingStatus.ensemble.isTraining ? 'in_progress' : 
                 trainingStatus.ensemble.stage === 'completed' ? 'completed' :
                 trainingStatus.ensemble.stage === 'failed' ? 'failed' : 'pending',
        metaLearning: trainingStatus.metaLearning.isTraining ? 'in_progress' : 
                     trainingStatus.metaLearning.stage === 'completed' ? 'completed' :
                     trainingStatus.metaLearning.stage === 'failed' ? 'failed' : 'pending',
        reinforcementLearning: trainingStatus.reinforcementLearning.isTraining ? 'in_progress' : 
                              trainingStatus.reinforcementLearning.stage === 'completed' ? 'completed' :
                              trainingStatus.reinforcementLearning.stage === 'failed' ? 'failed' : 'pending'
      });
    }
  }, [trainingStatus]);

  // Определяем, учится ли любая из нейросетей
  const isAnyNetworkTraining = !!(trainingStatus && (
    trainingStatus.neuralNetwork?.isTraining ||
    trainingStatus.ensemble?.isTraining ||
    trainingStatus.metaLearning?.isTraining ||
    trainingStatus.reinforcementLearning?.isTraining
  ));

  // Отладочная информация для лоадера
  useEffect(() => {
    console.log('🔍 Dashboard - isAnyNetworkTraining:', isAnyNetworkTraining);
    console.log('🔍 Dashboard - trainLoading:', trainLoading);
    console.log('🔍 Dashboard - Button loading state:', trainLoading || isAnyNetworkTraining);
  }, [isAnyNetworkTraining, trainLoading]);

  // Данные обновляются автоматически через WebSocket, интервалы не нужны

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
      return <Badge value={status} severity={statusMap[status] || 'info'}/>;
    }
    
    // Обработка объектов с полем status
    if (status.hasOwnProperty('status')) {
      const statusValue = status.status;
      const statusMap: { [key: string]: 'success' | 'warning' | 'danger' | 'info' } = {
        'active': 'success',
        'connected': 'success',
        'training': 'warning',
        'inactive': 'warning',
        'off': 'danger',
        'not_loaded': 'danger',
        'unknown': 'info'
      };
      
      let badgeText = statusValue;
      if (status.hasOwnProperty('clients')) {
        badgeText = `${statusValue} (${status.clients} клиент${status.clients === 1 ? '' : status.clients < 5 ? 'а' : 'ов'})`;
      } else if (status.hasOwnProperty('mode')) {
        badgeText = `${statusValue} (${status.mode})`;
      }
      
      return <Badge value={badgeText} severity={statusMap[statusValue] || 'info'}/>;
    }
    
    // Обработка разных форматов объектов статуса
    
    // NeuralNetworkService: {isLoaded, isTraining, status}
    if (status.hasOwnProperty('isLoaded')) {
      if (status.isTraining) {
        return <Badge value="Обучение" severity="warning" />;
      } else if (status.isLoaded) {
        return <Badge value="Готов" severity="success" />;
      } else {
        return <Badge value="Не загружен" severity="danger" />;
      }
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
    
    // TradingEngine: {isInitialized, isActive, currentMode, mode}
    if (status.hasOwnProperty('isInitialized') && status.hasOwnProperty('currentMode')) {
      const mode = status.mode || (typeof status.currentMode === 'string' ? status.currentMode : status.currentMode?.mode) || 'unknown';
      if (status.isActive) {
        return <Badge value={`Активен (${mode})`} severity="success" />;
      } else if (status.isInitialized) {
        return <Badge value={`Неактивен (${mode})`} severity="warning" />;
      } else {
        return <Badge value="Не инициализирован" severity="danger" />;
      }
    }
    
    // EnsembleService: {models, weights, performance}
    if (status.hasOwnProperty('models') || status.hasOwnProperty('loadedModels')) {
      const modelCount = status.loadedModels || Object.keys(status.models || {}).length;
      if (modelCount > 0) {
        return <Badge value={`Активен (${modelCount} моделей)`} severity="success" />;
      } else {
        return <Badge value="Модели не загружены" severity="warning" />;
      }
    }
    
    // Fallback для других объектов
    if (status.isActive) {
      return <Badge value="Активен" severity="success" />;
    } else if (status.isTraining) {
      return <Badge value="Обучение" severity="warning" />;
    } else if (status.isInitialized) {
      return <Badge value="Инициализирован" severity="info" />;
    } else {
      return <Badge value="Отключен" severity="danger" />;
    }
  };

  // Графики убраны для упрощения дашборда

  // Запуск обучения всех нейросетей одной кнопкой
  const handleTrainAllNetworks = async () => {
    confirmDialog({
      message: 'Запустить обучение всех нейросетей для всех доступных инструментов? Это может занять продолжительное время.',
      header: 'Подтверждение запуска обучения',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          setTrainLoading(true);
          setTrainingProgress('Инициализация...');
          console.log('🚀 Starting training all networks...');
          
          // Загружаем доступные инструменты
          setTrainingProgress('Загрузка инструментов...');
          console.log('📋 Fetching available instruments...');
          const instruments = await apiService.getNeuralNetworkInstruments();
          console.log('📊 Available instruments:', instruments);
          
          const instrumentList = Array.isArray(instruments) ? instruments : [];
          const figiList = instrumentList.map((i: any) => i.figi || i);
          
          console.log(`📈 Found ${figiList.length} instruments for training`);
          
          if (figiList.length === 0) {
            console.warn('⚠️ No instruments available for training');
            setError('Нет доступных инструментов для обучения. Возможно, нужно обновить кеш данных.');
            return;
          }

          // 1) Основная NN: пакетное обучение
          setTrainingProgress(`Обучение нейросети для ${figiList.length} инструментов...`);
          setTrainingStages(prev => ({ ...prev, neuralNetwork: 'in_progress' }));
          setTrainingStage('Обучение нейросети...');
          console.log('🧠 Starting batch neural network training...');
          const nnResult = await apiService.trainBatchNeuralNetwork(figiList, {
            epochs: 30,
            batchSize: 16,
            enableValidation: true
          });
          console.log('✅ Neural network training completed:', nnResult);
          setTrainingStages(prev => ({ ...prev, neuralNetwork: 'completed' }));
          setTrainingStage('Нейросеть обучена');

          // 2) Ансамбль: пакетное обучение
          setTrainingProgress('Обучение ансамбля...');
          setTrainingStages(prev => ({ ...prev, ensemble: 'in_progress' }));
          setTrainingStage('Обучение ансамбля...');
          console.log('🎭 Starting batch ensemble training...');
            // Ensemble требует минимум ~100 свечей, фильтруем
            const ensembleFigiList = instrumentList
              .filter((i: any) => (i?.candleCount ?? 0) >= 100)
              .map((i: any) => i.figi || i);
          
          console.log(`🎭 Ensemble training for ${ensembleFigiList.length} instruments with sufficient data`);
          
            if (ensembleFigiList.length > 0) {
            const ensembleResult = await apiService.trainBatchEnsemble(ensembleFigiList, { 
              epochs: 20, 
              batchSize: 8 
            });
            console.log('✅ Ensemble training completed:', ensembleResult);
            setTrainingStages(prev => ({ ...prev, ensemble: 'completed' }));
            setTrainingStage('Ансамбль обучен');
          } else {
            console.log('⚠️ No instruments with sufficient data for ensemble training');
            setTrainingStages(prev => ({ ...prev, ensemble: 'completed' }));
            setTrainingStage('Ансамбль пропущен (недостаточно данных)');
          }

          // 3) Meta-Learning: пакетное обучение
          setTrainingProgress('Обучение Meta-Learning...');
          setTrainingStages(prev => ({ ...prev, metaLearning: 'in_progress' }));
          setTrainingStage('Обучение Meta-Learning...');
          console.log('🧠 Starting batch meta-learning training...');
          const metaLearningResult = await apiService.trainBatchMetaLearning(figiList, {
            adaptationRate: 0.01,
            knowledgeBaseSize: 1000
          });
          console.log('✅ Meta-Learning training completed:', metaLearningResult);
          setTrainingStages(prev => ({ ...prev, metaLearning: 'completed' }));
          setTrainingStage('Meta-Learning обучен');

          // 4) Reinforcement Learning: пакетное обучение
          setTrainingProgress('Обучение Reinforcement Learning...');
          setTrainingStages(prev => ({ ...prev, reinforcementLearning: 'in_progress' }));
          setTrainingStage('Обучение Reinforcement Learning...');
          console.log('🤖 Starting batch reinforcement learning training...');
          const rlResult = await apiService.trainBatchReinforcementLearning(figiList, {
            episodes: 50,
            learningRate: 0.001
          });
          console.log('✅ Reinforcement Learning training completed:', rlResult);
          setTrainingStages(prev => ({ ...prev, reinforcementLearning: 'completed' }));
          setTrainingStage('Reinforcement Learning обучен');

          // 3) Обновляем данные
          setTrainingProgress('Обновление данных...');
          console.log('🔄 Refreshing dashboard data...');
          // Данные обновляются автоматически через WebSocket
          
          setTrainingProgress('Обучение завершено!');
          console.log('🎉 All training completed successfully!');
          
          // Очищаем прогресс через 3 секунды
          setTimeout(() => {
            setTrainingProgress('');
          }, 3000);
          
        } catch (e: any) {
          console.error('❌ Error during training all networks:', e);
          // Показываем пользователю ошибку
          setError(`Ошибка обучения: ${e.message || 'Неизвестная ошибка'}`);
          setTrainingProgress('');
          // Сбрасываем все стадии в failed
          setTrainingStages({
            neuralNetwork: 'failed',
            ensemble: 'failed',
            metaLearning: 'failed',
            reinforcementLearning: 'failed'
          });
          setTrainingStage('Ошибка обучения');
        } finally {
          setTrainLoading(false);
        }
      }
    });
  };

  return (
    <div className={`dashboard ${className}`}>
      <div className="grid">
        {/* Заголовок и статус подключения */}
        <div className="col-12">
          <Card className="h-full">
            <div className="flex flex-column md:flex-row md:align-items-center md:justify-content-between gap-3">
            <div>
              <div className="flex align-items-center gap-2 mb-2">
                <h1 className="m-0 text-3xl font-bold text-primary">📊 Панель управления</h1>
                {isConnected && (
                  <Badge 
                    value="LIVE" 
                    severity="success" 
                    className="animate-pulse"
                  />
                )}
              </div>
              <p className="text-600 mb-2">
                Мониторинг торговой системы и нейросетей
                {isConnected && <span className="text-green-500"> • Данные в реальном времени</span>}
              </p>
              {systemStatus && (
                <small className="text-500">
                  Обновлено: {new Date().toLocaleString('ru-RU')}
                </small>
              )}
        </div>

              <div className="flex align-items-center justify-content-center md:justify-content-end gap-2">
              <div className="text-center">
                  <div className="text-2xl mb-1">
                  {isConnected ? '🟢' : '🔴'}
                </div>
                  <div className="text-600 text-sm">
                  {isConnected ? 'Подключено к серверу' : 'Отключено от сервера'}
                </div>
                <small className="text-500">
                  {isConnected ? 'Данные обновляются в реальном времени' : 'Попытка переподключения...'}
                </small>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Сообщение об ошибке */}
        {error && (
          <div className="col-12">
            <Message severity="error" text={error} />
          </div>
        )}

        {/* Грид 2x2 для основных панелей */}
        
        {/* Краткая сводка по торговле */}
        <div className="col-12 xl:col-6">
          <TradingSummaryCard tradingStats={tradingStats} />
        </div>

        {/* Управление нейросетями */}
        <div className="col-12 xl:col-6">
          <NeuralNetworksControlCard
            trainingStatus={trainingStatus}
            isAnyNetworkTraining={isAnyNetworkTraining}
            trainLoading={trainLoading}
            trainingStages={trainingStages}
            trainingStage={trainingStage || null}
            trainingProgress={
              trainingProgress 
                ? (typeof trainingProgress === 'string' 
                    ? trainingProgress 
                    : typeof trainingProgress === 'object' && trainingProgress !== null
                    ? `${trainingProgress.currentEpoch || 0}/${trainingProgress.totalEpochs || 0} эпох`
                    : String(trainingProgress))
                : trainingProgressText || null
            }
            onTrainAllNetworks={handleTrainAllNetworks}
          />
        </div>
        
        {/* Статус системы */}
        <div className="col-12 xl:col-6">
          <Card title="🔧 Статус системы" className="h-full" key={systemStatus ? JSON.stringify(systemStatus) : 'loading'}>
            {!systemStatus ? (
              <div className="grid">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className="col-6">
                    <div className="text-center p-3 border-round surface-100">
                      <Skeleton width="100%" height="1.5rem" className="mb-2" />
                      <Skeleton width="60%" height="1rem" />
                    </div>
                  </div>
                ))}
              </div>
            ) : systemStatus ? (
              <div className="flex flex-column gap-3">
              <div className="grid">
                <div className="col-6">
                  <div className="text-center p-3 border-round surface-100">
                    <div className="text-900 font-medium mb-2">🧠 Нейросеть</div>
                    {getStatusBadge(systemStatus.neuralNetwork)}
                  </div>
                </div>
                <div className="col-6">
                  <div className="text-center p-3 border-round surface-100">
                    <div className="text-900 font-medium mb-2">🔌 WebSocket</div>
                    {getStatusBadge(systemStatus.websocket)}
                  </div>
                </div>
                <div className="col-6">
                  <div className="text-center p-3 border-round surface-100">
                    <div className="text-900 font-medium mb-2">⚙️ Торговый движок</div>
                    {getStatusBadge(systemStatus.trading)}
                  </div>
                </div>
                <div className="col-6">
                  <div className="text-center p-3 border-round surface-100">
                    <div className="text-900 font-medium mb-2">🗄️ База данных</div>
                    {getStatusBadge(systemStatus.database)}
                    </div>
                  </div>
                </div>

                {/* Ресурсы сервера */}
                <div className="p-3 border-round surface-100">
                  <div className="text-900 font-medium mb-2">💻 Ресурсы сервера</div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <div>
                      <span className="text-500 mr-1">CPU:</span>
                      <span className="text-900">
                        {systemResources?.cpu?.usage != null
                          ? `${systemResources.cpu.usage.toFixed(1)}%`
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-500 mr-1">Память:</span>
                      <span className="text-900">
                        {systemResources?.memory?.usage != null
                          ? `${systemResources.memory.usage}%`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center p-4">
                <p className="text-600">Нет данных о статусе системы</p>
              </div>
            )}
          </Card>
        </div>

        {/* Информация о кеше */}
        <div className="col-12 xl:col-6">
          <CacheStatusCard cacheStatus={cacheStatus} />
        </div>
      </div>

      {/* Новые WebSocket виджеты */}
      <div className="grid mt-3">
        {/* Торговые сигналы (WebSocket) */}
        <div className="col-12 lg:col-6">
          <TradingSignalsWidget maxSignals={10} />
        </div>

        {/* Записанные торговые сигналы из БД */}
        <div className="col-12 lg:col-6">
          <CachedSignalsCard maxSignals={20} />
        </div>

        {/* Системные алерты */}
        <div className="col-12 lg:col-6">
          <AlertsWidget maxAlerts={20} showClearButton={true} />
        </div>

        {/* Прогресс обучения */}
        {trainingProgress && (
          <div className="col-12 lg:col-6">
            <TrainingProgressWidget />
          </div>
        )}

        {/* Метрики моделей */}
        {modelMetrics.length > 0 && (
          <div className="col-12 lg:col-6">
            <ModelMetricsWidget maxMetrics={10} />
          </div>
        )}
      </div>

      <Toast ref={toast} />
      <ConfirmDialog />
    </div>
  );
};

export default Dashboard;

