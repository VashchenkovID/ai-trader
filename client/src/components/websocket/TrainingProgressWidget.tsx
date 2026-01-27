import React from 'react';
import { Card } from 'primereact/card';
import { ProgressBar } from 'primereact/progressbar';
import { Badge } from 'primereact/badge';
import { useWebSocketData } from '../WebSocketDataProvider';

interface TrainingProgressWidgetProps {
  className?: string;
}

const TrainingProgressWidget: React.FC<TrainingProgressWidgetProps> = ({ 
  className = ''
}) => {
  const { trainingProgress, isConnected } = useWebSocketData();

  if (!isConnected) {
    return (
      <Card title="📈 Прогресс обучения" className={className}>
        <div className="text-center p-3 text-500">
          <i className="pi pi-exclamation-triangle mr-2"></i>
          Нет подключения к серверу
        </div>
      </Card>
    );
  }

  if (!trainingProgress) {
    return (
      <Card title="📈 Прогресс обучения" className={className}>
        <div className="text-center p-4 text-500">
          <i className="pi pi-info-circle text-2xl mb-2"></i>
          <p>Обучение не запущено</p>
        </div>
      </Card>
    );
  }

  const progress = trainingProgress.totalEpochs > 0
    ? (trainingProgress.currentEpoch / trainingProgress.totalEpochs) * 100
    : 0;

  const modelTypeLabels: Record<string, string> = {
    neural_network: 'Нейросеть',
    ensemble: 'Ансамбль',
    meta_learning: 'Мета-обучение',
    reinforcement_learning: 'Reinforcement Learning'
  };

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return '—';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}ч ${minutes}м ${secs}с`;
    } else if (minutes > 0) {
      return `${minutes}м ${secs}с`;
    } else {
      return `${secs}с`;
    }
  };

  return (
    <Card 
      title={
        <div className="flex align-items-center justify-content-between">
          <span>📈 Прогресс обучения</span>
          <Badge 
            value={modelTypeLabels[trainingProgress.modelType] || trainingProgress.modelType}
            severity="info"
          />
        </div>
      }
      className={className}
    >
      <div className="flex flex-column gap-3">
        {/* Основной прогресс */}
        <div>
          <div className="flex justify-content-between mb-2">
            <span className="text-sm font-semibold">
              Эпоха {trainingProgress.currentEpoch} из {trainingProgress.totalEpochs}
            </span>
            <span className="text-sm text-600">{progress.toFixed(1)}%</span>
          </div>
          <ProgressBar value={progress} showValue={false} />
        </div>

        {/* Метрики */}
        <div className="grid">
          {trainingProgress.loss !== null && (
            <div className="col-6">
              <div className="text-sm text-600 mb-1">Loss</div>
              <div className="text-lg font-semibold text-red-500">
                {trainingProgress.loss.toFixed(4)}
              </div>
            </div>
          )}
          
          {trainingProgress.accuracy !== null && (
            <div className="col-6">
              <div className="text-sm text-600 mb-1">Accuracy</div>
              <div className="text-lg font-semibold text-green-500">
                {(trainingProgress.accuracy * 100).toFixed(2)}%
              </div>
            </div>
          )}
          
          {trainingProgress.valLoss !== null && (
            <div className="col-6">
              <div className="text-sm text-600 mb-1">Val Loss</div>
              <div className="text-lg font-semibold text-orange-500">
                {trainingProgress.valLoss.toFixed(4)}
              </div>
            </div>
          )}
          
          {trainingProgress.valAccuracy !== null && (
            <div className="col-6">
              <div className="text-sm text-600 mb-1">Val Accuracy</div>
              <div className="text-lg font-semibold text-blue-500">
                {(trainingProgress.valAccuracy * 100).toFixed(2)}%
              </div>
            </div>
          )}
        </div>

        {/* Дополнительная информация */}
        <div className="grid text-sm">
          {trainingProgress.learningRate !== null && (
            <div className="col-6">
              <span className="text-600">Learning Rate: </span>
              <span className="font-semibold">{trainingProgress.learningRate.toExponential(2)}</span>
            </div>
          )}
          
          {trainingProgress.speed !== null && (
            <div className="col-6">
              <span className="text-600">Скорость: </span>
              <span className="font-semibold">{trainingProgress.speed.toFixed(2)} samples/s</span>
            </div>
          )}
          
          {trainingProgress.eta !== null && (
            <div className="col-12">
              <span className="text-600">Осталось времени: </span>
              <span className="font-semibold text-blue-500">{formatTime(trainingProgress.eta)}</span>
            </div>
          )}
        </div>

        {trainingProgress.instrument && (
          <div className="text-sm text-600">
            <i className="pi pi-chart-line mr-2"></i>
            Инструмент: <strong>{trainingProgress.instrument}</strong>
          </div>
        )}
      </div>
    </Card>
  );
};

export default TrainingProgressWidget;

