import React from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { TrainingStatus } from '../../WebSocketDataProvider.tsx';
import { apiService } from '../../../services/apiService.ts';
import './NeuralNetworksControlCard.css';

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
  trainingProgress: string | any | null;
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

  const getStageIconClass = (stage: string) => {
    switch (stage) {
      case 'completed':
        return 'pi-check-circle stage-icon-success';
      case 'failed':
        return 'pi-times-circle stage-icon-error';
      case 'in_progress':
        return 'pi-spin pi-spinner stage-icon-info';
      default:
        return 'pi-circle stage-icon-secondary';
    }
  };

  const getStageSeverity = (stage: string): 'success' | 'danger' | 'info' | 'warning' => {
    switch (stage) {
      case 'completed':
        return 'success';
      case 'failed':
        return 'danger';
      case 'in_progress':
        return 'info';
      default:
        return 'warning';
    }
  };

  const getStageLabel = (stage: string) => {
    switch (stage) {
      case 'completed':
        return 'Завершено';
      case 'failed':
        return 'Ошибка';
      case 'in_progress':
        return 'В процессе';
      default:
        return 'Ожидание';
    }
  };

  return (
    <Card title="🧠 Управление нейросетями" className={`h-full neural-networks-control-card`}>
      <div className="content-wrapper">
        <Button
          icon="pi pi-play"
          label="Запустить обучение всех нейросетей"
          size="large"
          severity="success"
          loading={trainLoading || isAnyNetworkTraining}
          disabled={isAnyNetworkTraining}
          onClick={onTrainAllNetworks}
          className="train-button"
        />

        {trainingProgress && (
          <div className="progress-container">
            <small className="progress-text">
              {typeof trainingProgress === 'string' 
                ? trainingProgress 
                : typeof trainingProgress === 'object' && trainingProgress !== null
                ? `${trainingProgress.currentEpoch || 0}/${trainingProgress.totalEpochs || 0} эпох`
                : String(trainingProgress)}
            </small>
          </div>
        )}

        {/* Индикатор обучения через WebSocket */}
        {isAnyNetworkTraining && !trainLoading && (
          <div className="training-indicator">
            <div className="training-header">
              <i className="pi pi-spin pi-spinner" style={{ color: 'var(--color-accent-primary)' }}></i>
              <small className="training-text">Нейросети обучаются...</small>
            </div>
            <div className="training-details">
              {trainingStatus?.neuralNetwork?.isTraining && '🧠 Нейросеть • '}
              {trainingStatus?.ensemble?.isTraining && '🎭 Ансамбль • '}
              {trainingStatus?.metaLearning?.isTraining && '🧠 Meta-Learning • '}
              {trainingStatus?.reinforcementLearning?.isTraining && '🤖 RL'}
            </div>
          </div>
        )}

        {/* Отображение стадий обучения */}
        {trainLoading && (
          <div className="stages-container">
            <div className="stages-label">
              <small className="stages-label-text">Стадии обучения:</small>
            </div>

            <div className="stages-grid">
              {/* Нейросеть */}
              <div className="stage-col">
                <div className="stage-item">
                  <div className="stage-left">
                    <i className={`pi ${getStageIconClass(trainingStages.neuralNetwork)} stage-icon`}></i>
                    <span className="stage-text">🧠 Нейросеть</span>
                  </div>
                  <Badge
                    value={getStageLabel(trainingStages.neuralNetwork)}
                    severity={getStageSeverity(trainingStages.neuralNetwork)}
                  />
                </div>
              </div>

              {/* Ансамбль */}
              <div className="stage-col">
                <div className="stage-item">
                  <div className="stage-left">
                    <i className={`pi ${getStageIconClass(trainingStages.ensemble)} stage-icon`}></i>
                    <span className="stage-text">🎭 Ансамбль</span>
                  </div>
                  <Badge
                    value={getStageLabel(trainingStages.ensemble)}
                    severity={getStageSeverity(trainingStages.ensemble)}
                  />
                </div>
              </div>

              {/* Meta-Learning */}
              <div className="stage-col">
                <div className="stage-item">
                  <div className="stage-left">
                    <i className={`pi ${getStageIconClass(trainingStages.metaLearning)} stage-icon`}></i>
                    <span className="stage-text">🧠 Meta-Learning</span>
                  </div>
                  <Badge
                    value={getStageLabel(trainingStages.metaLearning)}
                    severity={getStageSeverity(trainingStages.metaLearning)}
                  />
                </div>
              </div>

              {/* Reinforcement Learning */}
              <div className="stage-col">
                <div className="stage-item">
                  <div className="stage-left">
                    <i className={`pi ${getStageIconClass(trainingStages.reinforcementLearning)} stage-icon`}></i>
                    <span className="stage-text">🤖 Reinforcement Learning</span>
                  </div>
                  <Badge
                    value={getStageLabel(trainingStages.reinforcementLearning)}
                    severity={getStageSeverity(trainingStages.reinforcementLearning)}
                  />
                </div>
              </div>
            </div>

            {/* Текущая стадия */}
            {trainingStage && (
              <div className="current-stage">
                <small className="current-stage-text">Текущая стадия: {trainingStage}</small>
              </div>
            )}
          </div>
        )}

        <div className="actions-container">
          <Button
            icon="pi pi-info-circle"
            label="Проверить статус"
            outlined
            className="action-button"
            onClick={handleCheckStatus}
          />
          <Button
            icon="pi pi-list"
            label="Отладка обучения"
            outlined
            severity="secondary"
            className="action-button"
            onClick={handleOpenTrainingDebug}
          />
        </div>
      </div>
    </Card>
  );
};

export default NeuralNetworksControlCard;


