import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { ProgressBar } from 'primereact/progressbar';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Divider } from 'primereact/divider';
import { Skeleton } from 'primereact/skeleton';
import { apiService } from '../services/apiService';

interface TrainingStatus {
  isTraining: boolean;
  progress?: number;
  currentInstrument?: string;
  eta?: string;
}

interface QuickActionsWidgetProps {
  className?: string;
  onStatusChange?: (status: any) => void;
}

const QuickActionsWidget: React.FC<QuickActionsWidgetProps> = ({ 
  className = '', 
  onStatusChange 
}) => {
  const [trainingStatus, setTrainingStatus] = useState<TrainingStatus>({
    isTraining: false
  });
  const [ensembleStatus, setEnsembleStatus] = useState<any>(null);
  const [metaLearningStatus, setMetaLearningStatus] = useState<any>(null);
  const [rlStatus, setRlStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Загрузка статусов всех нейросетей
  const loadStatuses = async () => {
    try {
      setLoading(true);
      
      const [trainingProgress, ensembleData, metaData, rlData] = await Promise.all([
        apiService.getNeuralNetworkStatus().catch(() => ({ isTraining: false })),
        apiService.getEnsembleModels().catch(() => null),
        apiService.getMetaLearningStatus().catch(() => null),
        apiService.getRLStatus().catch(() => null)
      ]);

      setTrainingStatus(trainingProgress);
      setEnsembleStatus(ensembleData);
      setMetaLearningStatus(metaData);
      setRlStatus(rlData);

      // Уведомляем родительский компонент об изменении статуса
      if (onStatusChange) {
        onStatusChange({
          training: trainingProgress,
          ensemble: ensembleData,
          metaLearning: metaData,
          reinforcementLearning: rlData
        });
      }
    } catch (error) {
      console.error('Error loading training statuses:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatuses();
    // Обновляем статусы каждые 10 секунд
    const interval = setInterval(loadStatuses, 10000);
    return () => clearInterval(interval);
  }, []);

  // Запуск обучения основной нейросети
  const handleStartTraining = async () => {
    confirmDialog({
      message: 'Запустить обучение основной нейросети? Это может занять несколько часов.',
      header: 'Подтверждение запуска обучения',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          setActionLoading('training');
          console.log('🚀 Starting batch training...');
          
          // Запускаем обучение для всех инструментов
          const instruments = await apiService.getNeuralNetworkInstruments();
          console.log(`📊 Found ${instruments.length} instruments for training`);
          
          if (instruments.length > 0) {
            // Извлекаем только FIGI из объектов инструментов
            const figiList = instruments.map(inst => inst.figi);
            console.log('📋 FIGI list:', figiList);
            
            // Запускаем пакетное обучение
            const result = await apiService.trainBatchNeuralNetwork(figiList, {
              epochs: 50,
              batchSize: 16,
              useAdvancedFeatures: true,
              enableValidation: true
            });
            
            console.log('✅ Batch training result:', result);
          } else {
            console.warn('⚠️ No instruments available for training');
          }
          
          await loadStatuses();
        } catch (error: any) {
          console.error('❌ Error starting training:', error);
        } finally {
          setActionLoading(null);
        }
      }
    });
  };

  // Остановка обучения основной нейросети
  const handleStopTraining = async () => {
    confirmDialog({
      message: 'Остановить обучение основной нейросети? Прогресс будет сохранен.',
      header: 'Подтверждение остановки обучения',
      icon: 'pi pi-question-circle',
      accept: async () => {
        try {
          setActionLoading('training');
          // Останавливаем обучение для всех инструментов
          const instruments = await apiService.getNeuralNetworkInstruments();
          for (const instrument of instruments) {
            await apiService.stopTraining(instrument);
          }
          await loadStatuses();
        } catch (error: any) {
          console.error('Error stopping training:', error);
        } finally {
          setActionLoading(null);
        }
      }
    });
  };

  // Запуск обучения ансамбля (батч одним запросом)
  const handleStartEnsembleTraining = async () => {
    confirmDialog({
      message: 'Запустить обучение ансамбля для всех доступных инструментов одним запросом?',
      header: 'Обучение ансамбля',
      icon: 'pi pi-info-circle',
      accept: async () => {
        try {
          setActionLoading('ensemble');
          const instruments = await apiService.getInstruments();
          const figiList = (Array.isArray(instruments) ? instruments : [])
            .map((inst: any) => inst?.figi ?? inst)
            .filter((f: any) => typeof f === 'string' && f.length > 0);

          if (figiList.length === 0) {
            console.warn('Нет доступных инструментов для обучения ансамбля');
            return;
          }

          await apiService.trainBatchEnsemble(figiList);
          await loadStatuses();
        } catch (error: any) {
          console.error('Error starting ensemble training:', error);
        } finally {
          setActionLoading(null);
        }
      }
    });
  };

  // Запуск мета-обучения
  const handleStartMetaLearning = async () => {
    try {
      setActionLoading('meta');
      await apiService.startMetaLearningAdaptation();
      await loadStatuses();
    } catch (error: any) {
      console.error('Error starting meta learning:', error);
    } finally {
      setActionLoading(null);
    }
  };

  // Остановка мета-обучения
  const handleStopMetaLearning = async () => {
    try {
      setActionLoading('meta');
      await apiService.stopMetaLearningAdaptation();
      await loadStatuses();
    } catch (error: any) {
      console.error('Error stopping meta learning:', error);
    } finally {
      setActionLoading(null);
    }
  };

  // Запуск обучения RL
  const handleStartRLTraining = async () => {
    try {
      setActionLoading('rl');
      await apiService.startRLTraining();
      await loadStatuses();
    } catch (error: any) {
      console.error('Error starting RL training:', error);
    } finally {
      setActionLoading(null);
    }
  };

  // Остановка обучения RL
  const handleStopRLTraining = async () => {
    try {
      setActionLoading('rl');
      await apiService.stopRLTraining();
      await loadStatuses();
    } catch (error: any) {
      console.error('Error stopping RL training:', error);
    } finally {
      setActionLoading(null);
    }
  };

  // Сброс RL агента
  const handleResetRLAgent = async () => {
    confirmDialog({
      message: 'Сбросить RL агента? Все обученные веса будут потеряны.',
      header: 'Сброс RL агента',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          setActionLoading('rl');
          await apiService.resetRLAgent();
          await loadStatuses();
        } catch (error: any) {
          console.error('Error resetting RL agent:', error);
        } finally {
          setActionLoading(null);
        }
      }
    });
  };

  // Сохранение всех моделей
  const handleSaveAllModels = async () => {
    try {
      setActionLoading('save');
      await apiService.saveAllModels();
    } catch (error: any) {
      console.error('Error saving models:', error);
    } finally {
      setActionLoading(null);
    }
  };

  // Загрузка всех моделей
  const handleLoadAllModels = async () => {
    try {
      setActionLoading('load');
      await apiService.loadAllModels();
      await loadStatuses();
    } catch (error: any) {
      console.error('Error loading models:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const getTrainingBadge = (isTraining: boolean, progress?: number) => {
    if (isTraining) {
      return <Badge value={`Обучение ${progress ? `${progress.toFixed(0)}%` : ''}`} severity="warning" />;
    }
    return <Badge value="Готов" severity="success" />;
  };

  return (
    <div className={`quick-actions-widget ${className}`}>
      <ConfirmDialog />
      
      <Card title="⚡ Управление нейросетями" className="h-full">
        {loading ? (
          <div className="grid">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="col-12">
                <Skeleton width="100%" height="3rem" className="mb-2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid">
            {/* Основная нейросеть */}
            <div className="col-12">
              <div className="surface-100 border-round p-3 mb-3">
                <div className="flex align-items-center justify-content-between mb-2">
                  <div className="flex align-items-center gap-2">
                    <i className="pi pi-brain text-primary"></i>
                    <span className="font-medium">Основная нейросеть</span>
                  </div>
                  {getTrainingBadge(trainingStatus.isTraining, trainingStatus.progress)}
                </div>
                
                {trainingStatus.isTraining && (
                  <div className="mb-2">
                    <ProgressBar 
                      value={trainingStatus.progress || 0} 
                      className="mb-2"
                    />
                    {trainingStatus.currentInstrument && (
                      <div className="text-sm text-600">
                        Обучение: {trainingStatus.currentInstrument}
                      </div>
                    )}
                  </div>
                )}
                
                <div className="flex gap-2">
                  {trainingStatus.isTraining ? (
                    <Button
                      icon="pi pi-stop"
                      label="Остановить"
                      size="small"
                      severity="danger"
                      loading={actionLoading === 'training'}
                      onClick={handleStopTraining}
                    />
                  ) : (
                    <Button
                      icon="pi pi-play"
                      label="Запустить обучение"
                      size="small"
                      severity="success"
                      loading={actionLoading === 'training'}
                      onClick={handleStartTraining}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Ансамбль моделей */}
            <div className="col-12">
              <div className="surface-100 border-round p-3 mb-3">
                <div className="flex align-items-center justify-content-between mb-2">
                  <div className="flex align-items-center gap-2">
                    <i className="pi pi-sitemap text-orange-500"></i>
                    <span className="font-medium">Ансамбль моделей</span>
                  </div>
                  <Badge 
                    value={ensembleStatus?.loadedModels ? 
                      `${ensembleStatus.loadedModels} моделей` : 
                      'Не загружен'
                    } 
                    severity={ensembleStatus?.loadedModels > 0 ? 'success' : 'warning'} 
                  />
                </div>
                
                <div className="flex gap-2">
                  <Button
                    icon="pi pi-cog"
                    label="Обучить все"
                    size="small"
                    severity="info"
                    loading={actionLoading === 'ensemble'}
                    onClick={handleStartEnsembleTraining}
                  />
                </div>
              </div>
            </div>

            {/* Мета-обучение */}
            <div className="col-12">
              <div className="surface-100 border-round p-3 mb-3">
                <div className="flex align-items-center justify-content-between mb-2">
                  <div className="flex align-items-center gap-2">
                    <i className="pi pi-sync text-purple-500"></i>
                    <span className="font-medium">Мета-обучение</span>
                  </div>
                  {getTrainingBadge(metaLearningStatus?.isAdapting || false)}
                </div>
                
                <div className="flex gap-2">
                  {metaLearningStatus?.isAdapting ? (
                    <Button
                      icon="pi pi-stop"
                      label="Остановить"
                      size="small"
                      severity="danger"
                      loading={actionLoading === 'meta'}
                      onClick={handleStopMetaLearning}
                    />
                  ) : (
                    <Button
                      icon="pi pi-play"
                      label="Запустить адаптацию"
                      size="small"
                      severity="success"
                      loading={actionLoading === 'meta'}
                      onClick={handleStartMetaLearning}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Обучение с подкреплением */}
            <div className="col-12">
              <div className="surface-100 border-round p-3 mb-3">
                <div className="flex align-items-center justify-content-between mb-2">
                  <div className="flex align-items-center gap-2">
                    <i className="pi pi-chart-line text-green-500"></i>
                    <span className="font-medium">Reinforcement Learning</span>
                  </div>
                  {getTrainingBadge(rlStatus?.isTraining || false)}
                </div>
                
                <div className="flex gap-2 flex-wrap">
                  {rlStatus?.isTraining ? (
                    <Button
                      icon="pi pi-stop"
                      label="Остановить"
                      size="small"
                      severity="danger"
                      loading={actionLoading === 'rl'}
                      onClick={handleStopRLTraining}
                    />
                  ) : (
                    <Button
                      icon="pi pi-play"
                      label="Запустить"
                      size="small"
                      severity="success"
                      loading={actionLoading === 'rl'}
                      onClick={handleStartRLTraining}
                    />
                  )}
                  
                  <Button
                    icon="pi pi-refresh"
                    label="Сбросить"
                    size="small"
                    severity="warning"
                    loading={actionLoading === 'rl'}
                    onClick={handleResetRLAgent}
                  />
                </div>
              </div>
            </div>

            <Divider />

            {/* Управление моделями */}
            <div className="col-12">
              <div className="text-center">
                <div className="text-600 mb-3">💾 Управление моделями</div>
                <div className="flex gap-2 justify-content-center flex-wrap">
                  <Button
                    icon="pi pi-save"
                    label="Сохранить все"
                    size="small"
                    severity="help"
                    loading={actionLoading === 'save'}
                    onClick={handleSaveAllModels}
                  />
                  <Button
                    icon="pi pi-upload"
                    label="Загрузить все"
                    size="small"
                    severity="help"
                    loading={actionLoading === 'load'}
                    onClick={handleLoadAllModels}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default QuickActionsWidget;
