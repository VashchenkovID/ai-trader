import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { Skeleton } from 'primereact/skeleton';
import { Message } from 'primereact/message';
import { apiService } from '../services/apiService';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { useWebSocketData } from '../components/WebSocketDataProvider';

interface DashboardProps {
  className?: string;
}

// Интерфейсы теперь импортируются из WebSocketDataProvider

const Dashboard: React.FC<DashboardProps> = ({ className = '' }) => {
  // Используем новый WebSocket провайдер
  const { 
    systemStatus, 
    cacheStatus, 
    tradingStats, 
    trainingStatus, 
    isConnected 
  } = useWebSocketData();

  // Отладочная информация
  useEffect(() => {
    console.log('🔍 Dashboard - WebSocket connected:', isConnected);
    console.log('🔍 Dashboard - System status:', systemStatus);
    console.log('🔍 Dashboard - System status type:', typeof systemStatus);
    console.log('🔍 Dashboard - System status keys:', systemStatus ? Object.keys(systemStatus) : 'null');
    console.log('🔍 Dashboard - Cache status:', cacheStatus);
    console.log('🔍 Dashboard - Trading stats:', tradingStats);
    console.log('🔍 Dashboard - Training status:', trainingStatus);
    console.log('🔍 Dashboard - Training status type:', typeof trainingStatus);
    console.log('🔍 Dashboard - Training status keys:', trainingStatus ? Object.keys(trainingStatus) : 'null');
    if (trainingStatus) {
      console.log('🔍 Dashboard - Neural network isTraining:', trainingStatus.neuralNetwork?.isTraining);
      console.log('🔍 Dashboard - Ensemble isTraining:', trainingStatus.ensemble?.isTraining);
      console.log('🔍 Dashboard - Meta learning isTraining:', trainingStatus.metaLearning?.isTraining);
      console.log('🔍 Dashboard - RL isTraining:', trainingStatus.reinforcementLearning?.isTraining);
    }
  }, [isConnected, systemStatus, cacheStatus, tradingStats, trainingStatus]);
  
  // Локальное состояние
  const [error, setError] = useState<string | null>(null);
  const [trainLoading, setTrainLoading] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState<string>('');
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
    
    // TradingEngine: {isInitialized, currentMode}
    if (status.hasOwnProperty('isInitialized') && status.hasOwnProperty('currentMode')) {
      if (status.isInitialized) {
        const mode = typeof status.currentMode === 'string' ? status.currentMode : 
                    status.currentMode?.mode || 'unknown';
        return <Badge value={`Активен (${mode})`} severity="success" />;
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
        {/* Заголовок слева */}
        <div className="col-12 xl:col-6">
          <Card className="h-full">
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
          </Card>
        </div>

        {/* Информация о подключении справа */}
        <div className="col-12 xl:col-6">
          <Card className="h-full">
            <div className="flex align-items-center justify-content-center">
              <div className="text-center">
                <div className="text-2xl mb-2">
                  {isConnected ? '🟢' : '🔴'}
                </div>
                <div className="text-600">
                  {isConnected ? 'Подключено к серверу' : 'Отключено от сервера'}
                </div>
                <small className="text-500">
                  {isConnected ? 'Данные обновляются в реальном времени' : 'Попытка переподключения...'}
                </small>
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
            ) : (
              <div className="text-center p-4">
                <p className="text-600">Нет данных о статусе системы</p>
              </div>
            )}
          </Card>
        </div>

        {/* Информация о кеше */}
        <div className="col-12 xl:col-6">
          <Card title="💾 Статус кеша" className="h-full">
            {!cacheStatus ? (
              <div className="grid">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="col-12">
                    <div className="text-center p-3 border-round surface-100">
                      <Skeleton width="100%" height="1.5rem" className="mb-2" />
                      <Skeleton width="60%" height="1rem" />
                    </div>
                  </div>
                ))}
              </div>
            ) : cacheStatus ? (
              <div className="grid">
                <div className="col-12">
                  <div className="text-center p-3 border-round surface-100">
                    <div className="text-900 font-medium mb-2">🕐 Последнее обновление</div>
                    <div className="text-600 text-sm">
                      {cacheStatus.lastUpdate ? 
                        new Date(cacheStatus.lastUpdate).toLocaleString('ru-RU') : 
                        'Никогда'
                      }
                    </div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="text-center p-3 border-round surface-100">
                    <div className="text-900 font-medium mb-2">⏱️ Время с обновления</div>
                    <div className="text-600 text-sm">
                      {cacheStatus.timeSinceLastUpdate ? 
                        `${cacheStatus.timeSinceLastUpdate} мин` : 
                        'Неизвестно'
                      }
                    </div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="text-center p-3 border-round surface-100">
                    <div className="text-900 font-medium mb-2">🔄 Интервал обновления</div>
                    <div className="text-600 text-sm">
                      {cacheStatus.updateInterval} мин
                    </div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="text-center p-3 border-round surface-100">
                    <div className="text-900 font-medium mb-2">⏰ Следующее обновление</div>
                    <div className="text-600 text-sm">
                      {cacheStatus.nextUpdateIn ? 
                        `через ${cacheStatus.nextUpdateIn} мин` : 
                        'Неизвестно'
                      }
                    </div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="text-center p-3 border-round surface-100">
                    <div className="text-900 font-medium mb-2">📊 Статус</div>
                    {cacheStatus.needsUpdate ? (
                      <Badge value="Требует обновления" severity="warning" />
                    ) : (
                      <Badge value="Актуален" severity="success" />
                    )}
                  </div>
                </div>
                <div className="col-12">
                  <div className="text-center p-3 border-round surface-100">
                    <Button
                      icon="pi pi-refresh"
                      label="Обновить кеш"
                      size="small"
                      severity="info"
                      className="w-full"
                      loading={false}
                      onClick={async () => {
                        try {
                          await apiService.refreshCache();
                          alert('Кеш обновлен!');
                        } catch (e) {
                          console.error('Cache refresh failed:', e);
                          alert('Ошибка обновления кеша');
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center p-4">
                <p className="text-600">Нет данных о кеше</p>
              </div>
            )}
          </Card>
        </div>

        {/* Краткая сводка по торговле */}
        <div className="col-12 xl:col-6">
          <Card title="📈 Торговая сводка" className="h-full">
            {!tradingStats ? (
              <div className="grid">
                {[1, 2].map((item) => (
                  <div key={item} className="col-6">
                    <div className="text-center p-3">
                      <Skeleton width="60%" height="2rem" className="mb-2" />
                      <Skeleton width="80%" height="1rem" />
                    </div>
                  </div>
                ))}
              </div>
            ) : tradingStats ? (
              <div className="grid">
                <div className="col-6">
                  <div className="text-center p-3">
                    <div className={`text-2xl font-bold mb-2 ${
                      (tradingStats.totalPnL || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {(() => {
                        const pnl = tradingStats.totalPnL || 0;
                        return `${pnl > 0 ? '+' : ''}${pnl.toFixed(1)}%`;
                      })()}
                    </div>
                    <div className="text-600">💰 Общая прибыль</div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="text-center p-3">
                    <div className="text-2xl font-bold text-blue-500 mb-2">
                      {(tradingStats.winRate || 0).toFixed(1)}%
                    </div>
                    <div className="text-600">🏆 Процент прибыльных</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center p-4">
                <p className="text-600">Нет торговых данных</p>
              </div>
            )}
          </Card>
        </div>

        {/* Управление нейросетями (одна кнопка) */}
        <div className="col-12 xl:col-6">
          <Card title="🧠 Управление нейросетями" className="h-full">
            <div className="flex flex-column align-items-center justify-content-center gap-3">
              <Button
                icon="pi pi-play"
                label="Запустить обучение всех нейросетей"
                size="large"
                severity="success"
                loading={trainLoading || isAnyNetworkTraining}
                disabled={isAnyNetworkTraining}
                onClick={handleTrainAllNetworks}
                className="w-full"
              />
              
              {trainingProgress && (
                <div className="text-center">
                  <small className="text-600">{trainingProgress}</small>
                </div>
              )}

              {/* Индикатор обучения через WebSocket */}
              {isAnyNetworkTraining && !trainLoading && (
                <div className="text-center">
                  <div className="flex align-items-center justify-content-center gap-2 mb-2">
                    <i className="pi pi-spin pi-spinner text-blue-500"></i>
                    <small className="text-600 font-medium">Нейросети обучаются...</small>
                  </div>
                  <div className="text-xs text-500">
                    {trainingStatus?.neuralNetwork?.isTraining && '🧠 Нейросеть • '}
                    {trainingStatus?.ensemble?.isTraining && '🎭 Ансамбль • '}
                    {trainingStatus?.metaLearning?.isTraining && '🧠 Meta-Learning • '}
                    {trainingStatus?.reinforcementLearning?.isTraining && '🤖 RL'}
                  </div>
                </div>
              )}

              {/* Отображение стадий обучения */}
              {trainLoading && (
                <div className="w-full">
                  <div className="text-center mb-3">
                    <small className="text-600 font-medium">Стадии обучения:</small>
                  </div>
                  
                  <div className="grid">
                    {/* Нейросеть */}
                    <div className="col-12">
                      <div className="flex align-items-center justify-content-between p-2 border-round surface-100">
                        <div className="flex align-items-center gap-2">
                          <i className={`pi ${trainingStages.neuralNetwork === 'completed' ? 'pi-check-circle text-green-500' : 
                            trainingStages.neuralNetwork === 'failed' ? 'pi-times-circle text-red-500' :
                            trainingStages.neuralNetwork === 'in_progress' ? 'pi-spin pi-spinner text-blue-500' : 
                            'pi-circle text-gray-500'}`}></i>
                          <span className="text-sm">🧠 Нейросеть</span>
                        </div>
                        <Badge 
                          value={trainingStages.neuralNetwork === 'completed' ? 'Завершено' :
                            trainingStages.neuralNetwork === 'failed' ? 'Ошибка' :
                            trainingStages.neuralNetwork === 'in_progress' ? 'В процессе' : 'Ожидание'}
                           severity={trainingStages.neuralNetwork === 'completed' ? 'success' :
                             trainingStages.neuralNetwork === 'failed' ? 'danger' :
                             trainingStages.neuralNetwork === 'in_progress' ? 'info' : 'warning'}
                        />
                      </div>
                    </div>

                    {/* Ансамбль */}
                    <div className="col-12">
                      <div className="flex align-items-center justify-content-between p-2 border-round surface-100">
                        <div className="flex align-items-center gap-2">
                          <i className={`pi ${trainingStages.ensemble === 'completed' ? 'pi-check-circle text-green-500' : 
                            trainingStages.ensemble === 'failed' ? 'pi-times-circle text-red-500' :
                            trainingStages.ensemble === 'in_progress' ? 'pi-spin pi-spinner text-blue-500' : 
                            'pi-circle text-gray-500'}`}></i>
                          <span className="text-sm">🎭 Ансамбль</span>
                        </div>
                        <Badge 
                          value={trainingStages.ensemble === 'completed' ? 'Завершено' :
                            trainingStages.ensemble === 'failed' ? 'Ошибка' :
                            trainingStages.ensemble === 'in_progress' ? 'В процессе' : 'Ожидание'}
                           severity={trainingStages.ensemble === 'completed' ? 'success' :
                             trainingStages.ensemble === 'failed' ? 'danger' :
                             trainingStages.ensemble === 'in_progress' ? 'info' : 'warning'}
                        />
                      </div>
                    </div>

                    {/* Meta-Learning */}
                    <div className="col-12">
                      <div className="flex align-items-center justify-content-between p-2 border-round surface-100">
                        <div className="flex align-items-center gap-2">
                          <i className={`pi ${trainingStages.metaLearning === 'completed' ? 'pi-check-circle text-green-500' : 
                            trainingStages.metaLearning === 'failed' ? 'pi-times-circle text-red-500' :
                            trainingStages.metaLearning === 'in_progress' ? 'pi-spin pi-spinner text-blue-500' : 
                            'pi-circle text-gray-500'}`}></i>
                          <span className="text-sm">🧠 Meta-Learning</span>
                        </div>
                        <Badge 
                          value={trainingStages.metaLearning === 'completed' ? 'Завершено' :
                            trainingStages.metaLearning === 'failed' ? 'Ошибка' :
                            trainingStages.metaLearning === 'in_progress' ? 'В процессе' : 'Ожидание'}
                           severity={trainingStages.metaLearning === 'completed' ? 'success' :
                             trainingStages.metaLearning === 'failed' ? 'danger' :
                             trainingStages.metaLearning === 'in_progress' ? 'info' : 'warning'}
                        />
                      </div>
                    </div>

                    {/* Reinforcement Learning */}
                    <div className="col-12">
                      <div className="flex align-items-center justify-content-between p-2 border-round surface-100">
                        <div className="flex align-items-center gap-2">
                          <i className={`pi ${trainingStages.reinforcementLearning === 'completed' ? 'pi-check-circle text-green-500' : 
                            trainingStages.reinforcementLearning === 'failed' ? 'pi-times-circle text-red-500' :
                            trainingStages.reinforcementLearning === 'in_progress' ? 'pi-spin pi-spinner text-blue-500' : 
                            'pi-circle text-gray-500'}`}></i>
                          <span className="text-sm">🤖 Reinforcement Learning</span>
                        </div>
                        <Badge 
                          value={trainingStages.reinforcementLearning === 'completed' ? 'Завершено' :
                            trainingStages.reinforcementLearning === 'failed' ? 'Ошибка' :
                            trainingStages.reinforcementLearning === 'in_progress' ? 'В процессе' : 'Ожидание'}
                           severity={trainingStages.reinforcementLearning === 'completed' ? 'success' :
                             trainingStages.reinforcementLearning === 'failed' ? 'danger' :
                             trainingStages.reinforcementLearning === 'in_progress' ? 'info' : 'warning'}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Текущая стадия */}
                  {trainingStage && (
                    <div className="text-center mt-3">
                      <small className="text-600 font-medium">Текущая стадия: {trainingStage}</small>
                    </div>
                  )}
                </div>
              )}
              
              <div className="flex gap-2 w-full">
                <Button
                  icon="pi pi-info-circle"
                  label="Проверить статус"
                  size="small"
                  severity="secondary"
                  className="flex-1"
                  onClick={async () => {
                    try {
                      const status = await apiService.getSystemStatus();
                      console.log('System status:', status);
                      alert(`Система: ${status?.neuralNetwork?.status || 'Неизвестно'}, WebSocket: ${status?.websocket?.status || 'Неизвестно'}, База данных: ${status?.database?.status || 'Неизвестно'}`);
                    } catch (e) {
                      console.error('Status check failed:', e);
                      alert('Ошибка получения статуса системы');
                    }
                  }}
                />
                <Button
                  icon="pi pi-clock"
                  label="Обновить время"
                  size="small"
                  severity="warning"
                  className="flex-1"
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/cache/force-update-time', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                      });
                      const result = await response.json();
                      if (result.success) {
                        alert('Время последнего обновления кеша обновлено!');
                      } else {
                        alert('Ошибка обновления времени кеша');
                      }
                    } catch (e) {
                      console.error('Force update cache time failed:', e);
                      alert('Ошибка обновления времени кеша');
                    }
                  }}
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Дополнительные действия и системная информация */}
        <div className="col-12">
          <Card title="🚀 Быстрые ссылки и система" className="h-full">
            <div className="grid">
              {/* Быстрые ссылки */}
              <div className="col-12 md:col-8">
                <div className="text-600 mb-3">📋 Быстрые переходы</div>
                <div className="grid">
                  <div className="col-6 md:col-3">
                    <Button
                      icon="pi pi-cog"
                      label="Настройки"
                      className="p-button-outlined w-full"
                      onClick={() => window.location.href = '/settings'}
                    />
                  </div>
                  <div className="col-6 md:col-3">
                    <Button
                      icon="pi pi-brain"
                      label="Нейросети"
                      className="p-button-outlined w-full"
                      onClick={() => window.location.href = '/neural-networks'}
                    />
                  </div>
                  <div className="col-6 md:col-3">
                    <Button
                      icon="pi pi-chart-line"
                      label="Аналитика"
                      className="p-button-outlined w-full"
                      onClick={() => window.location.href = '/metrics'}
                    />
                  </div>
                  <div className="col-6 md:col-3">
                    <Button
                      icon="pi pi-shopping-cart"
                      label="Торговые заявки"
                      className="p-button-outlined w-full"
                      onClick={() => window.location.href = '/trading-requests'}
                    />
                  </div>
                </div>
              </div>

              {/* Системная информация */}
              <div className="col-12 md:col-4">
                <div className="p-3 surface-100 border-round h-full">
                  <div className="text-600 mb-3">💻 Система</div>
                  <div className="grid">
                    <div className="col-6">
                      <div className="text-xs text-500 mb-1">Время работы</div>
                      <div className="font-medium text-sm">
                        0м
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="text-xs text-500 mb-1">Память</div>
                      <div className="font-medium text-sm">
                        0MB
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="text-xs text-500 mb-1">Кэш</div>
                      <div className="font-medium text-sm">
                        0 записей
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="text-xs text-500 mb-1">Статус</div>
                      <Badge value="Работает" severity="success" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
      <ConfirmDialog />
    </div>
  );
};

export default Dashboard;

