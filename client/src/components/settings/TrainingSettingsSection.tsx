import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '../ui/Card/Card';
import { Button } from '../ui/Button/Button';
import { Alert } from '../ui/Alert/Alert';
import { InputNumber } from '../ui/InputNumber/InputNumber';
import { InputSwitch } from 'primereact/inputswitch';
import { Divider } from '../ui/Divider/Divider';
import { Badge } from '../ui/Badge/Badge';
import { Select } from '../ui/Select/Select';
import { apiService } from '../../services/apiService';
import { Toast } from 'primereact/toast';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { workerMonitoringApi, Worker } from '../../services/workerMonitoringApi';
import './TrainingSettingsSection.css';

interface TrainingSettings {
  // Основные параметры обучения
  nnLearningRate: number;
  nnBatchSize: number;
  nnEpochs: number;
  nnDropoutRate: number;
  nnValidationSplit: number;
  nnEarlyStoppingPatience: number;
  
  // Настройки данных
  nnTrainingDays: number;
  nnTrainingLimit: number;
  nnQuickTrainingEnabled: boolean;
  nnQuickTrainingLimit: number;
  nnQuickTrainingDays: number;
  nnRetrainDays: number;
  nnModelMaxAgeDays: number;
  
  // Стратегия обучения
  nnTrainingStrategy: string;
  
  // Параметры LSTM
  nnSequenceLength: number;
  nnPredictionHorizon: number;
  
  // Пороги
  nnAccuracyThreshold: number;
  
  // Дивиденды
  nnIncludeDividends: boolean;
  nnDividendWeight: number;
}

interface TrainingStatus {
  isTraining: boolean;
  currentInstrument?: string;
  progress?: number;
  lastTrainingTime?: string;
}

// Значения по умолчанию для настроек обучения
const defaultTrainingSettings: TrainingSettings = {
  // Основные параметры обучения
  nnLearningRate: 0.0005,
  nnBatchSize: 16,
  nnEpochs: 50,
  nnDropoutRate: 0.2,
  nnValidationSplit: 0.2,
  nnEarlyStoppingPatience: 10,
  
  // Настройки данных
  nnTrainingDays: 180,
  nnTrainingLimit: 50,
  nnQuickTrainingEnabled: true,
  nnQuickTrainingLimit: 15,
  nnQuickTrainingDays: 30,
  nnRetrainDays: 180,
  nnModelMaxAgeDays: 7,
  
  // Стратегия обучения
  nnTrainingStrategy: 'progressive',
  
  // Параметры LSTM
  nnSequenceLength: 60,
  nnPredictionHorizon: 5,
  
  // Пороги
  nnAccuracyThreshold: 0.65,
  
  // Дивиденды
  nnIncludeDividends: true,
  nnDividendWeight: 0.1
};

const TrainingSettingsSection: React.FC = () => {
  const [settings, setSettings] = useState<TrainingSettings>(defaultTrainingSettings);
  const [trainingStatus, _setTrainingStatus] = useState<TrainingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [startingTraining, setStartingTraining] = useState(false);
  const [fullTrainingWorker, setFullTrainingWorker] = useState<Worker | null>(null);
  const toast = useRef<Toast>(null);

  useEffect(() => {
    loadData();
    // Обновляем статус обучения каждые 10 секунд
    const interval = setInterval(() => {
      loadTrainingStatus();
      loadFullTrainingWorker();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Загрузка информации о воркере полного обучения
  const loadFullTrainingWorker = async () => {
    try {
      const data = await workerMonitoringApi.getWorkersStatus();
      // Ищем воркер полного обучения (тип 'training' с trainingType: 'full')
      const fullTraining = data.workers.find(
        (w: Worker) => w.type === 'training' && 
        w.status === 'running' && 
        w.metadata?.trainingType === 'full'
      );
      setFullTrainingWorker(fullTraining || null);
    } catch (error) {
      // Игнорируем ошибки загрузки воркера
      console.warn('Failed to load full training worker:', error);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadSettings(), loadTrainingStatus()]);
    } catch (error: any) {
      console.error('Error loading training data:', error);
      showToast('error', 'Не удалось загрузить данные обучения');
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const allSettings = await apiService.getSettings();
      const trainingSettings = Array.isArray(allSettings) 
        ? allSettings.filter(s => s.category === 'neural_network' || s.category === 'scheduler')
        : [];

      // Начинаем с дефолтных значений
      const settingsMap: TrainingSettings = { ...defaultTrainingSettings };
      
      trainingSettings.forEach(setting => {
        let key = setting.key;
        
        // Преобразуем ключи из snake_case в camelCase
        // Например: nn_learning_rate -> nnLearningRate
        if (key.includes('_')) {
          const parts = key.split('_');
          key = parts[0] + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
        }
        
        // Преобразуем значение в нужный тип
        let value: any = setting.value;
        if (setting.dataType === 'number') {
          value = typeof value === 'string' ? parseFloat(value) : (value ?? null);
          if (isNaN(value)) {
            // Если значение невалидное, используем дефолтное
            console.warn(`Invalid number value for ${setting.key}: ${setting.value}`);
            return;
          }
        } else if (setting.dataType === 'boolean') {
          value = typeof value === 'string' ? value === 'true' : (value ?? false);
        }
        
        // Устанавливаем значение только если оно валидное
        if (value !== null && value !== undefined) {
          (settingsMap as any)[key] = value;
        }
      });
      
      console.log('Loaded training settings:', settingsMap);

      setSettings(settingsMap);
    } catch (error) {
      console.error('Error loading training settings:', error);
      // В случае ошибки используем дефолтные значения
      setSettings(defaultTrainingSettings);
    }
  };

  const loadTrainingStatus = async () => {
    try {
      // TODO: Добавить метод getTrainingStatus в apiService
      // const status = await apiService.getTrainingStatus();
      // setTrainingStatus(status);
    } catch (error) {
      console.error('Error loading training status:', error);
    }
  };

  const handleUpdate = useCallback(async (key: string, value: any) => {
    try {
      setSaving(prev => ({ ...prev, [key]: true }));
      
      // Преобразуем camelCase обратно в snake_case
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      
      await apiService.updateSettings({ [snakeKey]: value });
      
      setSettings(prev => ({ ...prev, [key]: value }));
      showToast('success', 'Настройка обновлена');
    } catch (error: any) {
      console.error(`Error updating ${key}:`, error);
      showToast('error', `Ошибка обновления настройки: ${error.message}`);
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  }, []);

  const handleStartTraining = async () => {
    if (!window.confirm('Запустить обучение всех нейросетей? Это может занять много времени.')) {
      return;
    }
    
    try {
      setStartingTraining(true);
      await apiService.startBatchTraining({
        epochs: settings.nnEpochs,
        batchSize: settings.nnBatchSize
      });
      showToast('success', 'Обучение запущено');
    } catch (error: any) {
      console.error('Error starting training:', error);
      showToast('error', `Ошибка запуска обучения: ${error.message}`);
    } finally {
      setStartingTraining(false);
    }
  };

  const showToast = (severity: 'success' | 'error' | 'info' | 'warn', message: string) => {
    if (toast.current) {
      toast.current.show({ severity, summary: message, life: 3000 });
    }
  };

  if (loading) {
    return (
      <div className="training-settings-section">
        <Card>
          <Skeleton height="200px" />
        </Card>
      </div>
    );
  }

  return (
    <div className="training-settings-section">
      <Toast ref={toast} />
      
      <div className="training-settings-grid">
        {/* Основные параметры обучения */}
        <Card className="training-settings-card">
          <div className="training-settings-card-header">
            <h3>Основные параметры обучения</h3>
          </div>
          <Divider />
          
          <div className="training-settings-form">
            <div className="training-settings-field">
              <label>Learning Rate</label>
              <InputNumber
                value={settings.nnLearningRate}
                onValueChange={(e) => handleUpdate('nnLearningRate', e.value ?? 0)}
                min={0.0001}
                max={0.01}
                step={0.0001}
                disabled={saving['nnLearningRate']}
              />
              <span className="training-settings-hint">
                Скорость обучения модели (0.0001 - 0.01)
              </span>
            </div>
            
            <div className="training-settings-field">
              <label>Batch Size</label>
              <InputNumber
                value={settings.nnBatchSize}
                onValueChange={(e) => handleUpdate('nnBatchSize', e.value ?? 0)}
                min={8}
                max={64}
                step={8}
                disabled={saving['nnBatchSize']}
              />
              <span className="training-settings-hint">
                Размер батча для обучения (8 - 64)
              </span>
            </div>
            
            <div className="training-settings-field">
              <label>Epochs</label>
              <InputNumber
                value={settings.nnEpochs}
                onValueChange={(e) => handleUpdate('nnEpochs', e.value ?? 0)}
                min={20}
                max={200}
                step={10}
                disabled={saving['nnEpochs']}
              />
              <span className="training-settings-hint">
                Количество эпох обучения (20 - 200)
              </span>
            </div>
            
            <div className="training-settings-field">
              <label>Dropout Rate</label>
              <InputNumber
                value={settings.nnDropoutRate}
                onValueChange={(e) => handleUpdate('nnDropoutRate', e.value ?? 0)}
                min={0.1}
                max={0.5}
                step={0.05}
                disabled={saving['nnDropoutRate']}
              />
              <span className="training-settings-hint">
                Коэффициент dropout для предотвращения переобучения (0.1 - 0.5)
              </span>
            </div>
            
            <div className="training-settings-field">
              <label>Validation Split</label>
              <InputNumber
                value={settings.nnValidationSplit}
                onValueChange={(e) => handleUpdate('nnValidationSplit', e.value ?? 0)}
                min={0.1}
                max={0.3}
                step={0.05}
                disabled={saving['nnValidationSplit']}
              />
              <span className="training-settings-hint">
                Доля данных для валидации (0.1 - 0.3)
              </span>
            </div>
            
            <div className="training-settings-field">
              <label>Early Stopping Patience</label>
              <InputNumber
                value={settings.nnEarlyStoppingPatience}
                onValueChange={(e) => handleUpdate('nnEarlyStoppingPatience', e.value ?? 0)}
                min={5}
                max={20}
                step={1}
                disabled={saving['nnEarlyStoppingPatience']}
              />
              <span className="training-settings-hint">
                Количество эпох без улучшения для early stopping (5 - 20)
              </span>
            </div>
          </div>
        </Card>

        {/* Настройки данных */}
        <Card className="training-settings-card">
          <div className="training-settings-card-header">
            <h3>Настройки данных</h3>
          </div>
          <Divider />
          
          <div className="training-settings-form">
            <div className="training-settings-field">
              <label>Training Days</label>
              <InputNumber
                value={settings.nnTrainingDays}
                onValueChange={(e) => handleUpdate('nnTrainingDays', e.value ?? 0)}
                min={30}
                max={730}
                step={30}
                disabled={saving['nnTrainingDays']}
              />
              <span className="training-settings-hint">
                Количество дней исторических данных для обучения (30 - 730)
              </span>
            </div>
            
            <div className="training-settings-field">
              <label>Training Limit</label>
              <InputNumber
                value={settings.nnTrainingLimit}
                onValueChange={(e) => handleUpdate('nnTrainingLimit', e.value ?? 0)}
                min={10}
                max={100}
                step={10}
                disabled={saving['nnTrainingLimit']}
              />
              <span className="training-settings-hint">
                Максимальное количество инструментов для обучения за раз (10 - 100)
              </span>
            </div>
            
            <div className="training-settings-field">
              <label>Retrain Days</label>
              <InputNumber
                value={settings.nnRetrainDays}
                onValueChange={(e) => handleUpdate('nnRetrainDays', e.value ?? 0)}
                min={7}
                max={90}
                step={7}
                disabled={saving['nnRetrainDays']}
              />
              <span className="training-settings-hint">
                Интервал переобучения в днях (7 - 90)
              </span>
            </div>
            
            <div className="training-settings-field">
              <label>Model Max Age (Days)</label>
              <InputNumber
                value={settings.nnModelMaxAgeDays}
                onValueChange={(e) => handleUpdate('nnModelMaxAgeDays', e.value ?? 0)}
                min={1}
                max={365}
                step={1}
                disabled={saving['nnModelMaxAgeDays']}
              />
              <span className="training-settings-hint">
                Максимальный возраст модели в днях (1 - 365)
              </span>
            </div>
            
            <div className="training-settings-field">
              <div className="training-settings-switch">
                <label>Quick Training Enabled</label>
                <InputSwitch
                  checked={settings.nnQuickTrainingEnabled}
                  onChange={(e) => handleUpdate('nnQuickTrainingEnabled', e.value)}
                />
              </div>
              <span className="training-settings-hint">
                Включить быстрое обучение для новых инструментов
              </span>
            </div>
            
            {settings.nnQuickTrainingEnabled && (
              <>
                <div className="training-settings-field">
                  <label>Quick Training Limit</label>
                  <InputNumber
                    value={settings.nnQuickTrainingLimit}
                    onValueChange={(e) => handleUpdate('nnQuickTrainingLimit', e.value ?? 0)}
                    min={5}
                    max={50}
                    step={5}
                    disabled={saving['nnQuickTrainingLimit']}
                  />
                  <span className="training-settings-hint">
                    Максимальное количество инструментов для быстрого обучения (5 - 50)
                  </span>
                </div>
                
                <div className="training-settings-field">
                  <label>Quick Training Days</label>
                  <InputNumber
                    value={settings.nnQuickTrainingDays}
                    onValueChange={(e) => handleUpdate('nnQuickTrainingDays', e.value ?? 0)}
                    min={7}
                    max={60}
                    step={7}
                    disabled={saving['nnQuickTrainingDays']}
                  />
                  <span className="training-settings-hint">
                    Количество дней данных для быстрого обучения (7 - 60)
                  </span>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Параметры модели */}
        <Card className="training-settings-card">
          <div className="training-settings-card-header">
            <h3>Параметры модели</h3>
          </div>
          <Divider />
          
          <div className="training-settings-form">
            <div className="training-settings-field">
              <label>Training Strategy</label>
              <Select
                value={settings.nnTrainingStrategy}
                onChange={(e) => handleUpdate('nnTrainingStrategy', e.target.value)}
                options={[
                  { value: 'progressive', label: 'Прогрессивное обучение' },
                  { value: 'ensemble', label: 'Ансамблевое обучение' },
                  { value: 'adaptive', label: 'Адаптивное обучение' },
                  { value: 'transfer', label: 'Transfer Learning' },
                  { value: 'reinforcement', label: 'Reinforcement Learning' }
                ]}
                disabled={saving['nnTrainingStrategy']}
              />
              <span className="training-settings-hint">
                Стратегия обучения нейросети
              </span>
            </div>
            
            <div className="training-settings-field">
              <label>Sequence Length</label>
              <InputNumber
                value={settings.nnSequenceLength}
                onValueChange={(e) => handleUpdate('nnSequenceLength', e.value ?? 0)}
                min={20}
                max={120}
                step={10}
                disabled={saving['nnSequenceLength']}
              />
              <span className="training-settings-hint">
                Длина временной последовательности для LSTM (20 - 120)
              </span>
            </div>
            
            <div className="training-settings-field">
              <label>Prediction Horizon (Days)</label>
              <InputNumber
                value={settings.nnPredictionHorizon}
                onValueChange={(e) => handleUpdate('nnPredictionHorizon', e.value ?? 0)}
                min={1}
                max={30}
                step={1}
                disabled={saving['nnPredictionHorizon']}
              />
              <span className="training-settings-hint">
                Горизонт предсказания в днях (1 - 30)
              </span>
            </div>
            
            <div className="training-settings-field">
              <label>Accuracy Threshold</label>
              <InputNumber
                value={settings.nnAccuracyThreshold}
                onValueChange={(e) => handleUpdate('nnAccuracyThreshold', e.value ?? 0)}
                min={0.5}
                max={0.95}
                step={0.05}
                disabled={saving['nnAccuracyThreshold']}
              />
              <span className="training-settings-hint">
                Минимальная точность для принятия модели (0.5 - 0.95)
              </span>
            </div>
            
            <div className="training-settings-field">
              <div className="training-settings-switch">
                <label>Include Dividends</label>
                <InputSwitch
                  checked={settings.nnIncludeDividends}
                  onChange={(e) => handleUpdate('nnIncludeDividends', e.value)}
                />
              </div>
              <span className="training-settings-hint">
                Включить дивиденды как фактор в нейросеть
              </span>
            </div>
            
            {settings.nnIncludeDividends && (
              <div className="training-settings-field">
                <label>Dividend Weight</label>
                <InputNumber
                  value={settings.nnDividendWeight}
                  onValueChange={(e) => handleUpdate('nnDividendWeight', e.value ?? 0)}
                  min={0.0}
                  max={1.0}
                  step={0.1}
                  disabled={saving['nnDividendWeight']}
                />
                <span className="training-settings-hint">
                  Вес дивидендного фактора в нейросети (0.0 - 1.0)
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* Управление обучением */}
        <Card className="training-settings-card">
          <div className="training-settings-card-header">
            <h3>Управление обучением</h3>
            {trainingStatus?.isTraining && (
              <Badge variant="warning">Обучение в процессе</Badge>
            )}
          </div>
          <Divider />
          
          <div className="training-settings-form">
            {/* Отображение стадии полного обучения */}
            {fullTrainingWorker && (
              <Alert variant="info">
                <div style={{ marginBottom: '8px' }}>
                  <strong>Полное обучение нейросетей</strong>
                </div>
                {fullTrainingWorker.metadata?.currentStage && (
                  <div style={{ marginBottom: '4px', fontWeight: 600, color: 'var(--color-primary)' }}>
                    Стадия: {fullTrainingWorker.metadata.currentStage}
                  </div>
                )}
                {fullTrainingWorker.metadata?.trainingStage && fullTrainingWorker.metadata?.totalStages && (
                  <div style={{ marginBottom: '4px' }}>
                    Этап: {fullTrainingWorker.metadata.trainingStage} / {fullTrainingWorker.metadata.totalStages}
                  </div>
                )}
                {fullTrainingWorker.metadata?.currentTicker && (
                  <div style={{ marginBottom: '4px' }}>
                    Инструмент: {fullTrainingWorker.metadata.currentTicker}
                  </div>
                )}
                {fullTrainingWorker.metadata?.currentInstrument !== undefined && fullTrainingWorker.metadata?.totalInstruments !== undefined && (
                  <div style={{ marginBottom: '4px' }}>
                    Прогресс: {fullTrainingWorker.metadata.currentInstrument} / {fullTrainingWorker.metadata.totalInstruments} инструментов
                  </div>
                )}
                {fullTrainingWorker.metadata?.remainingOperations !== undefined && (
                  <div style={{ marginBottom: '4px' }}>
                    Осталось операций: {fullTrainingWorker.metadata.remainingOperations}
                  </div>
                )}
                <div>
                  Прогресс: {Math.round(fullTrainingWorker.progress)}%
                </div>
              </Alert>
            )}
            {trainingStatus?.isTraining && !fullTrainingWorker && (
              <Alert variant="info">
                {trainingStatus.currentInstrument 
                  ? `Обучение для ${trainingStatus.currentInstrument}...` 
                  : 'Обучение в процессе...'}
                {trainingStatus.progress !== undefined && (
                  <div>Прогресс: {trainingStatus.progress}%</div>
                )}
              </Alert>
            )}
            
            {trainingStatus?.lastTrainingTime && (
              <div className="training-settings-info">
                <strong>Последнее обучение:</strong> {new Date(trainingStatus.lastTrainingTime).toLocaleString('ru-RU')}
              </div>
            )}
            
            <Button
              variant="primary"
              onClick={handleStartTraining}
              disabled={startingTraining || trainingStatus?.isTraining}
            >
              {startingTraining ? 'Запуск...' : 'Запустить обучение всех моделей'}
            </Button>
            
            <div className="training-settings-hint">
              Запустит обучение для всех инструментов с текущими настройками
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default TrainingSettingsSection;

