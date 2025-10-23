import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { ProgressBar } from 'primereact/progressbar';
import { Message } from 'primereact/message';
import { Divider } from 'primereact/divider';
import { Badge } from 'primereact/badge';
import { useAllWebSocketData } from '../hooks/useWebSocketData';
import { apiService } from '../services/apiService';

interface Instrument {
  figi: string;
  name: string;
  ticker: string;
}

interface TrainingOptions {
  epochs: number;
  batchSize: number;
  days: number;
}

interface TrainingResult {
  network: string;
  success: boolean;
  accuracy?: number;
  error?: string;
  duration?: number;
}

const TrainingDebug: React.FC = () => {
  const { trainingStatus } = useAllWebSocketData();
  
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument | null>(null);
  const [trainingOptions, setTrainingOptions] = useState<TrainingOptions>({
    epochs: 50,
    batchSize: 16,
    days: 180
  });
  
  const [isTraining, setIsTraining] = useState(false);
  const [trainingResults, setTrainingResults] = useState<TrainingResult[]>([]);
  const [currentTraining, setCurrentTraining] = useState<string>('');
  const [trainingLog, setTrainingLog] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [totalDuration, setTotalDuration] = useState<number>(0);

  // Загружаем инструменты при монтировании
  useEffect(() => {
    loadInstruments();
  }, []);

  // Отслеживаем статус обучения
  useEffect(() => {
    if (trainingStatus) {
      const activeTrainings = [];
      if (trainingStatus.neuralNetwork?.isTraining) activeTrainings.push('Neural Network');
      if (trainingStatus.ensemble?.isTraining) activeTrainings.push('Ensemble');
      if (trainingStatus.metaLearning?.isTraining) activeTrainings.push('Meta-Learning');
      if (trainingStatus.reinforcementLearning?.isTraining) activeTrainings.push('Reinforcement Learning');
      
      setCurrentTraining(activeTrainings.join(', '));
      
      if (activeTrainings.length === 0 && isTraining) {
        // Обучение завершено
        setIsTraining(false);
        setCurrentTraining('');
        if (startTime) {
          const duration = Date.now() - startTime.getTime();
          setTotalDuration(duration);
          addToLog(`✅ Обучение завершено за ${Math.round(duration / 1000)} секунд`);
        }
      }
    }
  }, [trainingStatus, isTraining, startTime]);

  const loadInstruments = async () => {
    try {
      const data = await apiService.getNeuralNetworkInstruments();
      setInstruments(data || []);
      addToLog(`📊 Загружено ${data?.length || 0} инструментов`);
    } catch (error) {
      console.error('Ошибка загрузки инструментов:', error);
      // reportError(error as Error);
    }
  };

  const addToLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setTrainingLog(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const startTraining = async () => {
    if (!selectedInstrument) {
      addToLog('❌ Выберите инструмент для обучения');
      return;
    }

    setIsTraining(true);
    setTrainingResults([]);
    setTrainingLog([]);
    setStartTime(new Date());
    setTotalDuration(0);
    setCurrentTraining('Инициализация...');

    addToLog(`🚀 Начинаем обучение для ${selectedInstrument.name} (${selectedInstrument.ticker})`);
    addToLog(`📊 Параметры: ${trainingOptions.epochs} эпох, batch size ${trainingOptions.batchSize}, ${trainingOptions.days} дней`);

    try {
      // 1. Обучение традиционной нейросети
      addToLog('🧠 Запуск обучения традиционной нейросети...');
      setCurrentTraining('Neural Network');
      
      const nnStartTime = Date.now();
      const nnResult = await apiService.trainNeuralNetwork(selectedInstrument.figi, {
        epochs: trainingOptions.epochs,
        batchSize: trainingOptions.batchSize,
        days: trainingOptions.days
      });
      const nnDuration = Date.now() - nnStartTime;
      
      setTrainingResults(prev => [...prev, {
        network: 'Neural Network',
        success: nnResult?.success !== false,
        accuracy: nnResult?.accuracy,
        error: nnResult?.error,
        duration: nnDuration
      }]);
      
      addToLog(`🧠 Нейросеть: ${nnResult?.success !== false ? '✅ Успешно' : '❌ Ошибка'} ${nnResult?.accuracy ? `(точность: ${nnResult.accuracy.toFixed(3)})` : ''}`);

      // 2. Обучение ансамбля
      addToLog('🎭 Запуск обучения ансамбля...');
      setCurrentTraining('Ensemble');
      
      const ensembleStartTime = Date.now();
      const ensembleResult = await apiService.trainEnsemble(selectedInstrument.figi, {
        epochs: trainingOptions.epochs,
        batchSize: trainingOptions.batchSize,
        days: trainingOptions.days
      });
      const ensembleDuration = Date.now() - ensembleStartTime;
      
      setTrainingResults(prev => [...prev, {
        network: 'Ensemble',
        success: ensembleResult?.success !== false,
        accuracy: ensembleResult?.accuracy,
        error: ensembleResult?.error,
        duration: ensembleDuration
      }]);
      
      addToLog(`🎭 Ансамбль: ${ensembleResult?.success !== false ? '✅ Успешно' : '❌ Ошибка'} ${ensembleResult?.accuracy ? `(точность: ${ensembleResult.accuracy.toFixed(3)})` : ''}`);

      // 3. Обучение Meta-Learning
      addToLog('🧠 Запуск обучения Meta-Learning...');
      setCurrentTraining('Meta-Learning');
      
      const metaStartTime = Date.now();
      const metaResult = await apiService.trainMetaLearning(selectedInstrument.figi, {
        epochs: trainingOptions.epochs,
        batchSize: trainingOptions.batchSize,
        days: trainingOptions.days
      });
      const metaDuration = Date.now() - metaStartTime;
      
      setTrainingResults(prev => [...prev, {
        network: 'Meta-Learning',
        success: metaResult?.success !== false,
        accuracy: metaResult?.accuracy,
        error: metaResult?.error,
        duration: metaDuration
      }]);
      
      addToLog(`🧠 Meta-Learning: ${metaResult?.success !== false ? '✅ Успешно' : '❌ Ошибка'} ${metaResult?.accuracy ? `(точность: ${metaResult.accuracy.toFixed(3)})` : ''}`);

      // 4. Обучение Reinforcement Learning
      addToLog('🤖 Запуск обучения Reinforcement Learning...');
      setCurrentTraining('Reinforcement Learning');
      
      const rlStartTime = Date.now();
      const rlResult = await apiService.trainReinforcementLearning(selectedInstrument.figi, {
        epochs: trainingOptions.epochs,
        batchSize: trainingOptions.batchSize,
        days: trainingOptions.days
      });
      const rlDuration = Date.now() - rlStartTime;
      
      setTrainingResults(prev => [...prev, {
        network: 'Reinforcement Learning',
        success: rlResult?.success !== false,
        accuracy: rlResult?.accuracy,
        error: rlResult?.error,
        duration: rlDuration
      }]);
      
      addToLog(`🤖 RL: ${rlResult?.success !== false ? '✅ Успешно' : '❌ Ошибка'} ${rlResult?.accuracy ? `(точность: ${rlResult.accuracy.toFixed(3)})` : ''}`);

      addToLog('🎉 Обучение всех нейросетей завершено!');
      
    } catch (error) {
      console.error('Ошибка обучения:', error);
      addToLog(`❌ Ошибка обучения: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
      // reportError(error as Error);
    } finally {
      setIsTraining(false);
      setCurrentTraining('');
    }
  };

  const stopTraining = () => {
    setIsTraining(false);
    setCurrentTraining('');
    addToLog('⏹️ Обучение остановлено пользователем');
  };

  const clearResults = () => {
    setTrainingResults([]);
    setTrainingLog([]);
    setTotalDuration(0);
  };

  const getSuccessCount = () => {
    return trainingResults.filter(r => r.success).length;
  };

  const getAverageAccuracy = () => {
    const successfulResults = trainingResults.filter(r => r.success && r.accuracy);
    if (successfulResults.length === 0) return 0;
    return successfulResults.reduce((sum, r) => sum + (r.accuracy || 0), 0) / successfulResults.length;
  };

  return (
    <div className="grid">
      <div className="col-12">
        <Card title="🔧 Отладка обучения нейросетей" className="mb-4">
          <div className="grid">
            {/* Выбор инструмента */}
            <div className="col-12 md:col-6">
              <label htmlFor="instrument" className="block text-900 font-medium mb-2">
                Выберите инструмент
              </label>
              <Dropdown
                id="instrument"
                value={selectedInstrument}
                onChange={(e) => setSelectedInstrument(e.value)}
                options={instruments}
                optionLabel="name"
                optionValue="value"
                placeholder="Выберите инструмент"
                className="w-full"
                disabled={isTraining}
              />
              {selectedInstrument && (
                <div className="mt-2">
                  <small className="text-600">
                    {selectedInstrument.ticker} • {selectedInstrument.figi}
                  </small>
                </div>
              )}
            </div>

            {/* Параметры обучения */}
            <div className="col-12 md:col-6">
              <label className="block text-900 font-medium mb-2">
                Параметры обучения
              </label>
              <div className="grid">
                <div className="col-4">
                  <label htmlFor="epochs" className="block text-600 text-sm mb-1">Эпохи</label>
                  <InputNumber
                    id="epochs"
                    value={trainingOptions.epochs}
                    onValueChange={(e) => setTrainingOptions(prev => ({ ...prev, epochs: e.value || 50 }))}
                    min={1}
                    max={1000}
                    disabled={isTraining}
                    className="w-full"
                  />
                </div>
                <div className="col-4">
                  <label htmlFor="batchSize" className="block text-600 text-sm mb-1">Batch Size</label>
                  <InputNumber
                    id="batchSize"
                    value={trainingOptions.batchSize}
                    onValueChange={(e) => setTrainingOptions(prev => ({ ...prev, batchSize: e.value || 16 }))}
                    min={1}
                    max={128}
                    disabled={isTraining}
                    className="w-full"
                  />
                </div>
                <div className="col-4">
                  <label htmlFor="days" className="block text-600 text-sm mb-1">Дней</label>
                  <InputNumber
                    id="days"
                    value={trainingOptions.days}
                    onValueChange={(e) => setTrainingOptions(prev => ({ ...prev, days: e.value || 180 }))}
                    min={30}
                    max={365}
                    disabled={isTraining}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </div>

          <Divider />

          {/* Кнопки управления */}
          <div className="flex gap-2 mb-4">
            <Button
              label={isTraining ? "Остановить обучение" : "Запустить обучение"}
              icon={isTraining ? "pi pi-stop" : "pi pi-play"}
              onClick={isTraining ? stopTraining : startTraining}
              severity={isTraining ? "danger" : "success"}
              disabled={!selectedInstrument}
              className="flex-1"
            />
            <Button
              label="Очистить результаты"
              icon="pi pi-trash"
              onClick={clearResults}
              severity="secondary"
              disabled={isTraining}
            />
            <Button
              label="Обновить инструменты"
              icon="pi pi-refresh"
              onClick={loadInstruments}
              severity="info"
              disabled={isTraining}
            />
          </div>

          {/* Статус обучения */}
          {isTraining && (
            <div className="mb-4">
              <div className="flex align-items-center justify-content-between mb-2">
                <span className="text-900 font-medium">Статус обучения:</span>
                <Badge value={currentTraining} severity="info" />
              </div>
              <ProgressBar mode="indeterminate" className="h-1rem" />
            </div>
          )}

          {/* Результаты обучения */}
          {trainingResults.length > 0 && (
            <div className="mb-4">
              <h5>📊 Результаты обучения</h5>
              <div className="grid">
                <div className="col-12 md:col-3">
                  <Card className="text-center">
                    <div className="text-2xl font-bold text-green-500">{getSuccessCount()}</div>
                    <div className="text-600">Успешно</div>
                  </Card>
                </div>
                <div className="col-12 md:col-3">
                  <Card className="text-center">
                    <div className="text-2xl font-bold text-blue-500">
                      {getAverageAccuracy().toFixed(3)}
                    </div>
                    <div className="text-600">Средняя точность</div>
                  </Card>
                </div>
                <div className="col-12 md:col-3">
                  <Card className="text-center">
                    <div className="text-2xl font-bold text-orange-500">
                      {trainingResults.length - getSuccessCount()}
                    </div>
                    <div className="text-600">Ошибок</div>
                  </Card>
                </div>
                <div className="col-12 md:col-3">
                  <Card className="text-center">
                    <div className="text-2xl font-bold text-purple-500">
                      {totalDuration > 0 ? `${Math.round(totalDuration / 1000)}с` : '-'}
                    </div>
                    <div className="text-600">Время</div>
                  </Card>
                </div>
              </div>

              <div className="mt-3">
                {trainingResults.map((result, index) => (
                  <div key={index} className="mb-2">
                    <Message
                      severity={result.success ? "success" : "error"}
                      text={`${result.network}: ${result.success ? `Точность ${result.accuracy?.toFixed(3)}` : result.error}`}
                      className="w-full"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Лог обучения */}
          {trainingLog.length > 0 && (
            <div>
              <h5>📝 Лог обучения</h5>
              <div className="border-1 surface-border border-round p-3" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {trainingLog.map((log, index) => (
                  <div key={index} className="mb-1 text-sm font-mono">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default TrainingDebug;
