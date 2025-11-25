import React from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { TrainingStatus } from '../WebSocketDataProvider';
import { apiService } from '../../services/apiService';

interface NeuralNetworksControlCardProps {
  trainingStatus: TrainingStatus | null;
  isAnyNetworkTraining: boolean;
  trainLoading: boolean;
  trainingStages: {
    neuralNetwork: 'pending' | 'in_progress' | 'completed' | 'failed';
    ensemble: 'pending' | 'in_progress' | 'completed' | 'failed';
    metaLearning: 'pending' | 'in_progress' | 'completed' | 'failed';
    reinforcementLearning: 'pending' | 'in_progress' | 'completed' | 'failed';
  };
  trainingStage: string | null;
  trainingProgress: string | null;
  onTrainAllNetworks: () => void;
}

export const NeuralNetworksControlCard: React.FC<NeuralNetworksControlCardProps> = ({
  trainingStatus,
  isAnyNetworkTraining,
  trainLoading,
  trainingStages,
  trainingStage,
  trainingProgress,
  onTrainAllNetworks,
}) => {
  const handleCheckStatus = async () => {
    try {
      const status = await apiService.getSystemStatus();
      // eslint-disable-next-line no-alert
      alert(
        `Система: ${status?.neuralNetwork?.status || 'Неизвестно'}, WebSocket: ${
          status?.websocket?.status || 'Неизвестно'
        }, База данных: ${status?.database?.status || 'Неизвестно'}`
      );
    } catch (e) {
      console.error('Status check failed:', e);
      // eslint-disable-next-line no-alert
      alert('Ошибка получения статуса системы');
    }
  };

  const handleOpenTrainingDebug = () => {
    window.location.href = '/training-debug';
  };

  return (
    <Card title="🧠 Управление нейросетями" className="h-full">
      <div className="flex flex-column align-items-center justify-content-center gap-3">
        <Button
          icon="pi pi-play"
          label="Запустить обучение всех нейросетей"
          size="large"
          severity="success"
          loading={trainLoading || isAnyNetworkTraining}
          disabled={isAnyNetworkTraining}
          onClick={onTrainAllNetworks}
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
                    <i
                      className={`pi ${
                        trainingStages.neuralNetwork === 'completed'
                          ? 'pi-check-circle text-green-500'
                          : trainingStages.neuralNetwork === 'failed'
                          ? 'pi-times-circle text-red-500'
                          : trainingStages.neuralNetwork === 'in_progress'
                          ? 'pi-spin pi-spinner text-blue-500'
                          : 'pi-circle text-gray-500'
                      }`}
                    ></i>
                    <span className="text-sm">🧠 Нейросеть</span>
                  </div>
                  <Badge
                    value={
                      trainingStages.neuralNetwork === 'completed'
                        ? 'Завершено'
                        : trainingStages.neuralNetwork === 'failed'
                        ? 'Ошибка'
                        : trainingStages.neuralNetwork === 'in_progress'
                        ? 'В процессе'
                        : 'Ожидание'
                    }
                    severity={
                      trainingStages.neuralNetwork === 'completed'
                        ? 'success'
                        : trainingStages.neuralNetwork === 'failed'
                        ? 'danger'
                        : trainingStages.neuralNetwork === 'in_progress'
                        ? 'info'
                        : 'warning'
                    }
                  />
                </div>
              </div>

              {/* Ансамбль */}
              <div className="col-12">
                <div className="flex align-items-center justify-content-between p-2 border-round surface-100">
                  <div className="flex align-items-center gap-2">
                    <i
                      className={`pi ${
                        trainingStages.ensemble === 'completed'
                          ? 'pi-check-circle text-green-500'
                          : trainingStages.ensemble === 'failed'
                          ? 'pi-times-circle text-red-500'
                          : trainingStages.ensemble === 'in_progress'
                          ? 'pi-spin pi-spinner text-blue-500'
                          : 'pi-circle text-gray-500'
                      }`}
                    ></i>
                    <span className="text-sm">🎭 Ансамбль</span>
                  </div>
                  <Badge
                    value={
                      trainingStages.ensemble === 'completed'
                        ? 'Завершено'
                        : trainingStages.ensemble === 'failed'
                        ? 'Ошибка'
                        : trainingStages.ensemble === 'in_progress'
                        ? 'В процессе'
                        : 'Ожидание'
                    }
                    severity={
                      trainingStages.ensemble === 'completed'
                        ? 'success'
                        : trainingStages.ensemble === 'failed'
                        ? 'danger'
                        : trainingStages.ensemble === 'in_progress'
                        ? 'info'
                        : 'warning'
                    }
                  />
                </div>
              </div>

              {/* Meta-Learning */}
              <div className="col-12">
                <div className="flex align-items-center justify-content-between p-2 border-round surface-100">
                  <div className="flex align-items-center gap-2">
                    <i
                      className={`pi ${
                        trainingStages.metaLearning === 'completed'
                          ? 'pi-check-circle text-green-500'
                          : trainingStages.metaLearning === 'failed'
                          ? 'pi-times-circle text-red-500'
                          : trainingStages.metaLearning === 'in_progress'
                          ? 'pi-spin pi-spinner text-blue-500'
                          : 'pi-circle text-gray-500'
                      }`}
                    ></i>
                    <span className="text-sm">🧠 Meta-Learning</span>
                  </div>
                  <Badge
                    value={
                      trainingStages.metaLearning === 'completed'
                        ? 'Завершено'
                        : trainingStages.metaLearning === 'failed'
                        ? 'Ошибка'
                        : trainingStages.metaLearning === 'in_progress'
                        ? 'В процессе'
                        : 'Ожидание'
                    }
                    severity={
                      trainingStages.metaLearning === 'completed'
                        ? 'success'
                        : trainingStages.metaLearning === 'failed'
                        ? 'danger'
                        : trainingStages.metaLearning === 'in_progress'
                        ? 'info'
                        : 'warning'
                    }
                  />
                </div>
              </div>

              {/* Reinforcement Learning */}
              <div className="col-12">
                <div className="flex align-items-center justify-content-between p-2 border-round surface-100">
                  <div className="flex align-items-center gap-2">
                    <i
                      className={`pi ${
                        trainingStages.reinforcementLearning === 'completed'
                          ? 'pi-check-circle text-green-500'
                          : trainingStages.reinforcementLearning === 'failed'
                          ? 'pi-times-circle text-red-500'
                          : trainingStages.reinforcementLearning === 'in_progress'
                          ? 'pi-spin pi-spinner text-blue-500'
                          : 'pi-circle text-gray-500'
                      }`}
                    ></i>
                    <span className="text-sm">🤖 Reinforcement Learning</span>
                  </div>
                  <Badge
                    value={
                      trainingStages.reinforcementLearning === 'completed'
                        ? 'Завершено'
                        : trainingStages.reinforcementLearning === 'failed'
                        ? 'Ошибка'
                        : trainingStages.reinforcementLearning === 'in_progress'
                        ? 'В процессе'
                        : 'Ожидание'
                    }
                    severity={
                      trainingStages.reinforcementLearning === 'completed'
                        ? 'success'
                        : trainingStages.reinforcementLearning === 'failed'
                        ? 'danger'
                        : trainingStages.reinforcementLearning === 'in_progress'
                        ? 'info'
                        : 'warning'
                    }
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
            outlined
            className="w-full"
            onClick={handleCheckStatus}
          />
          <Button
            icon="pi pi-list"
            label="Отладка обучения"
            outlined
            severity="secondary"
            className="w-full"
            onClick={handleOpenTrainingDebug}
          />
        </div>
      </div>
    </Card>
  );
};

export default NeuralNetworksControlCard;


