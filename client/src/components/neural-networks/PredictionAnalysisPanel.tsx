import React, { useEffect, useState } from 'react';
import { Card } from 'primereact/card';
import { Dropdown } from 'primereact/dropdown';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { apiService } from '../../services/apiService';

interface Instrument {
  figi: string;
  name: string;
  ticker: string;
}

interface PredictionAnalysisPanelProps {
  className?: string;
}

const PredictionAnalysisPanel: React.FC<PredictionAnalysisPanelProps> = ({ className = '' }) => {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [selectedInstrument, setSelectedInstrument] = useState<Instrument | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<any | null>(null);

  useEffect(() => {
    const loadInstruments = async () => {
      try {
        const data = await apiService.getNeuralNetworkInstruments();
        setInstruments(data || []);
      } catch (e) {
        console.error('Ошибка загрузки инструментов для анализа:', e);
        setError('Не удалось загрузить список инструментов');
      }
    };

    loadInstruments();
  }, []);

  const handleAnalyze = async () => {
    if (!selectedInstrument) {
      setError('Выберите инструмент для анализа');
      return;
    }

    setIsLoading(true);
    setError(null);
    setPrediction(null);

    try {
      const result = await apiService.getEnsemblePrediction(selectedInstrument.figi);
      setPrediction(result);
    } catch (e: any) {
      console.error('Ошибка получения предсказания ансамбля:', e);
      setError(e?.response?.data?.message || e?.message || 'Ошибка получения предсказания');
    } finally {
      setIsLoading(false);
    }
  };

  const renderPrediction = () => {
    if (!prediction) return null;

    const score = prediction.score ?? prediction.probability ?? null;
    const confidence = prediction.confidence ?? null;
    const recommendation = prediction.recommendation ?? prediction.actionName ?? prediction.action ?? null;

    // Объяснение от традиционной нейросети, если оно есть внутри интегрированного ответа
    const traditionalDetails = prediction.details?.traditional?.rawDetails;
    const explanationSummary = traditionalDetails?.summary as string | undefined;
    const explanationConfidence = traditionalDetails?.confidence as string | undefined;
    const explanationRisk = traditionalDetails?.risk as string | undefined;

    return (
      <div className="mt-3">
        <h5>📈 Результат предсказания</h5>
        <div className="grid">
          {score !== null && (
            <div className="col-12 md:col-4">
              <Card className="text-center">
                <div className="text-2xl font-bold text-blue-500">
                  {typeof score === 'number' ? score.toFixed(3) : String(score)}
                </div>
                <div className="text-600">Скор/вероятность роста</div>
              </Card>
            </div>
          )}
          {confidence !== null && (
            <div className="col-12 md:col-4">
              <Card className="text-center">
                <div className="text-2xl font-bold text-green-500">
                  {typeof confidence === 'number' ? (confidence * 100).toFixed(1) + '%' : String(confidence)}
                </div>
                <div className="text-600">Уверенность ансамбля</div>
              </Card>
            </div>
          )}
          {recommendation && (
            <div className="col-12 md:col-4">
              <Card className="text-center">
                <div className="text-2xl font-bold">
                  {String(recommendation)}
                </div>
                <div className="text-600">Рекомендация</div>
              </Card>
            </div>
          )}
        </div>

        {(explanationSummary || explanationConfidence || explanationRisk) && (
          <div className="mt-4">
            <h5>🧠 Пояснение нейросети</h5>
            {explanationSummary && (
              <p className="mb-1">
                <strong>Кратко:</strong> {explanationSummary}
              </p>
            )}
            {explanationConfidence && (
              <p className="mb-1">
                <strong>Уверенность модели:</strong> {explanationConfidence}
              </p>
            )}
            {explanationRisk && (
              <p className="mb-0">
                <strong>Оценка риска:</strong> {explanationRisk}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card title="📊 Анализ и предсказания по акциям" className={className}>
      <div className="grid">
        <div className="col-12 md:col-6">
          <label htmlFor="analysis-instrument" className="block text-900 font-medium mb-2">
            Инструмент для анализа
          </label>
          <Dropdown
            id="analysis-instrument"
            value={selectedInstrument}
            onChange={(e) => setSelectedInstrument(e.value)}
            options={instruments}
            optionLabel="name"
            placeholder="Выберите инструмент"
            className="w-full"
            disabled={isLoading}
          />
          {selectedInstrument && (
            <div className="mt-2">
              <small className="text-600">
                {selectedInstrument.ticker} • {selectedInstrument.figi}
              </small>
            </div>
          )}
        </div>

        <div className="col-12 md:col-6 flex align-items-end">
          <Button
            label={isLoading ? 'Выполняется анализ...' : 'Запустить анализ и предсказание'}
            icon="pi pi-chart-line"
            onClick={handleAnalyze}
            disabled={isLoading || !instruments.length}
            className="w-full"
          />
        </div>
      </div>

      {error && (
        <div className="mt-3">
          <Message severity="error" text={error} />
        </div>
      )}

      {renderPrediction()}
    </Card>
  );
};

export default PredictionAnalysisPanel;


