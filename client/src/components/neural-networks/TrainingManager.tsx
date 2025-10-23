import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { ProgressBar } from 'primereact/progressbar';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { Checkbox } from 'primereact/checkbox';
import { Toast } from 'primereact/toast';
import { useRef } from 'react';
import { apiService } from '../../services/apiService';

interface TrainingManagerProps {
  className?: string;
}

interface TrainingConfig {
  figi: string;
  epochs: number;
  batchSize: number;
  learningRate: number;
  validationSplit: number;
  earlyStopping: boolean;
  dataAugmentation: boolean;
}

interface TrainingProgress {
  epoch: number;
  totalEpochs: number;
  loss: number;
  accuracy: number;
  valLoss: number;
  valAccuracy: number;
  isTraining: boolean;
  startTime: string;
  estimatedEndTime: string;
}

const TrainingManager: React.FC<TrainingManagerProps> = ({ className = '' }) => {
  const [trainingConfig, setTrainingConfig] = useState<TrainingConfig>({
    figi: 'BBG004730N88',
    epochs: 100,
    batchSize: 32,
    learningRate: 0.001,
    validationSplit: 0.2,
    earlyStopping: true,
    dataAugmentation: false
  });
  const [trainingProgress, setTrainingProgress] = useState<TrainingProgress | null>(null);
  const [availableInstruments, setAvailableInstruments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const toast = useRef<Toast>(null);

  // Загрузка доступных инструментов
  const loadInstruments = async () => {
    try {
      const response = await apiService.getInstruments();
      if (Array.isArray(response)) {
        setAvailableInstruments(response);
      } else if (response && typeof response === 'object' && 'success' in response) {
        const successResponse = response as { success: boolean; data?: any[] };
        if (successResponse.success) {
          setAvailableInstruments(successResponse.data || []);
        }
      }
    } catch (error) {
      console.error('Error loading instruments:', error);
    }
  };

  // Загрузка прогресса обучения
  const loadTrainingProgress = async () => {
    try {
      const response = await apiService.getTrainingProgress(trainingConfig.figi);
      if (response.success) {
        setTrainingProgress(response.data);
        setIsTraining(response.data.isTraining);
      }
    } catch (error) {
      console.error('Error loading training progress:', error);
    }
  };

  // Автоматическое обновление прогресса
  useEffect(() => {
    if (isTraining) {
      const interval = setInterval(loadTrainingProgress, 2000);
      return () => clearInterval(interval);
    }
  }, [isTraining]);

  // Загрузка при монтировании
  useEffect(() => {
    loadInstruments();
    loadTrainingProgress();
  }, []);

  // Запуск обучения
  const startTraining = async () => {
    try {
      setLoading(true);
      const response = await apiService.trainNeuralNetwork(trainingConfig.figi, {
        epochs: trainingConfig.epochs,
        batchSize: trainingConfig.batchSize,
        learningRate: trainingConfig.learningRate,
        validationSplit: trainingConfig.validationSplit,
        earlyStopping: trainingConfig.earlyStopping,
        dataAugmentation: trainingConfig.dataAugmentation
      });

      if (response.success) {
        setIsTraining(true);
        toast.current?.show({
          severity: 'success',
          summary: 'Успех',
          detail: 'Обучение запущено'
        });
        await loadTrainingProgress();
      }
    } catch (error) {
      console.error('Error starting training:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось запустить обучение'
      });
    } finally {
      setLoading(false);
    }
  };

  // Остановка обучения
  const stopTraining = async () => {
    try {
      setLoading(true);
      const response = await apiService.stopTraining(trainingConfig.figi);
      
      if (response.success) {
        setIsTraining(false);
        toast.current?.show({
          severity: 'info',
          summary: 'Остановлено',
          detail: 'Обучение остановлено'
        });
        await loadTrainingProgress();
      }
    } catch (error) {
      console.error('Error stopping training:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось остановить обучение'
      });
    } finally {
      setLoading(false);
    }
  };

  // Получение опций для dropdown
  const instrumentOptions = availableInstruments.map(inst => ({
    label: `${inst.ticker} - ${inst.name}`,
    value: inst.figi
  }));

  // Форматирование времени
  const formatTime = (timeString: string) => {
    return new Date(timeString).toLocaleString();
  };

  // Расчет оставшегося времени
  const getEstimatedTime = () => {
    if (!trainingProgress || !trainingProgress.isTraining || !trainingProgress.startTime) return null;
    
    const now = new Date();
    const start = new Date(trainingProgress.startTime);
    const elapsed = now.getTime() - start.getTime();
    const progress = (trainingProgress.epoch || 0) / (trainingProgress.totalEpochs || 1);
    
    if (progress > 0) {
      const totalTime = elapsed / progress;
      const remaining = totalTime - elapsed;
      return new Date(now.getTime() + remaining).toLocaleString();
    }
    
    return null;
  };

  return (
    <div className={`training-manager ${className}`}>
      <Toast ref={toast} />
      
      {/* Конфигурация обучения */}
      <Card title="⚙️ Конфигурация обучения" className="mb-4">
        <div className="grid">
          <div className="col-12 md:col-6">
            <div className="field">
              <label htmlFor="figi" className="font-semibold">Инструмент</label>
              <Dropdown
                id="figi"
                value={trainingConfig.figi}
                options={instrumentOptions}
                onChange={(e) => setTrainingConfig({...trainingConfig, figi: e.value})}
                placeholder="Выберите инструмент"
                className="w-full"
              />
            </div>
          </div>
          <div className="col-12 md:col-6">
            <div className="field">
              <label htmlFor="epochs" className="font-semibold">Количество эпох</label>
              <InputNumber
                id="epochs"
                value={trainingConfig.epochs}
                onValueChange={(e) => setTrainingConfig({...trainingConfig, epochs: e.value || 100})}
                min={1}
                max={1000}
                className="w-full"
              />
            </div>
          </div>
          <div className="col-12 md:col-6">
            <div className="field">
              <label htmlFor="batchSize" className="font-semibold">Размер батча</label>
              <InputNumber
                id="batchSize"
                value={trainingConfig.batchSize}
                onValueChange={(e) => setTrainingConfig({...trainingConfig, batchSize: e.value || 32})}
                min={1}
                max={512}
                className="w-full"
              />
            </div>
          </div>
          <div className="col-12 md:col-6">
            <div className="field">
              <label htmlFor="learningRate" className="font-semibold">Скорость обучения</label>
              <InputNumber
                id="learningRate"
                value={trainingConfig.learningRate}
                onValueChange={(e) => setTrainingConfig({...trainingConfig, learningRate: e.value || 0.001})}
                min={0.0001}
                max={1}
                step={0.0001}
                className="w-full"
              />
            </div>
          </div>
          <div className="col-12 md:col-6">
            <div className="field">
              <label htmlFor="validationSplit" className="font-semibold">Доля валидации</label>
              <InputNumber
                id="validationSplit"
                value={trainingConfig.validationSplit}
                onValueChange={(e) => setTrainingConfig({...trainingConfig, validationSplit: e.value || 0.2})}
                min={0.1}
                max={0.5}
                step={0.1}
                className="w-full"
              />
            </div>
          </div>
          <div className="col-12 md:col-6">
            <div className="field">
              <label className="font-semibold">Дополнительные опции</label>
              <div className="flex flex-column gap-2">
                <div className="flex align-items-center">
                  <Checkbox
                    id="earlyStopping"
                    checked={trainingConfig.earlyStopping}
                    onChange={(e) => setTrainingConfig({...trainingConfig, earlyStopping: e.checked || false})}
                  />
                  <label htmlFor="earlyStopping" className="ml-2">Early Stopping</label>
                </div>
                <div className="flex align-items-center">
                  <Checkbox
                    id="dataAugmentation"
                    checked={trainingConfig.dataAugmentation}
                    onChange={(e) => setTrainingConfig({...trainingConfig, dataAugmentation: e.checked || false})}
                  />
                  <label htmlFor="dataAugmentation" className="ml-2">Аугментация данных</label>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-content-end gap-2 mt-3">
          <Button
            label="Остановить"
            icon="pi pi-stop"
            onClick={stopTraining}
            loading={loading}
            disabled={!isTraining}
            severity="danger"
          />
          <Button
            label={isTraining ? "Обучение..." : "Запустить обучение"}
            icon={isTraining ? "pi pi-spin pi-spinner" : "pi pi-play"}
            onClick={startTraining}
            loading={loading}
            disabled={isTraining}
            severity="success"
          />
        </div>
      </Card>

      {/* Прогресс обучения */}
      {trainingProgress && (
        <Card title="📈 Прогресс обучения" className="mb-4">
          <div className="grid">
            <div className="col-12 md:col-6">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-2xl font-bold text-primary mb-2">
                  {trainingProgress.epoch || 0} / {trainingProgress.totalEpochs || 0}
                </div>
                <div className="text-600 mb-3">Эпоха</div>
                <ProgressBar 
                  value={((trainingProgress.epoch || 0) / (trainingProgress.totalEpochs || 1)) * 100}
                  className="w-full"
                />
              </div>
            </div>
            <div className="col-12 md:col-6">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-2xl font-bold text-green-500 mb-2">
                  {((trainingProgress.accuracy || 0) * 100).toFixed(2)}%
                </div>
                <div className="text-600 mb-3">Точность</div>
                <div className="text-sm text-600">
                  Валидация: {((trainingProgress.valAccuracy || 0) * 100).toFixed(2)}%
                </div>
              </div>
            </div>
          </div>
          
          <div className="grid mt-3">
            <div className="col-12 md:col-6">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-xl font-bold text-orange-500 mb-2">
                  {(trainingProgress.loss || 0).toFixed(4)}
                </div>
                <div className="text-600">Потери</div>
                <div className="text-sm text-600">
                  Валидация: {(trainingProgress.valLoss || 0).toFixed(4)}
                </div>
              </div>
            </div>
            <div className="col-12 md:col-6">
              <div className="text-center p-3 border-round surface-100">
                <div className="text-xl font-bold text-blue-500 mb-2">
                  {getEstimatedTime() ? formatTime(getEstimatedTime()!) : 'N/A'}
                </div>
                <div className="text-600">Ожидаемое завершение</div>
                <div className="text-sm text-600">
                  Начато: {trainingProgress.startTime ? formatTime(trainingProgress.startTime) : 'N/A'}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* История обучения */}
      <Card title="📚 История обучения">
        <div className="text-center p-4">
          <i className="pi pi-info-circle text-4xl text-blue-500 mb-3"></i>
          <p>История обучения будет доступна после завершения обучения</p>
        </div>
      </Card>
    </div>
  );
};

export default TrainingManager;
