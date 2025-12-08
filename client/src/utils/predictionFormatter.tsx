import React from 'react';

/**
 * Интерфейс для деталей источника предсказания
 */
interface SourceDetails {
  score?: number;
  confidence?: number;
  recommendation?: string;
  weight?: number;
  rawDetails?: any;
  horizons?: any;
}

/**
 * Интерфейс для объекта details предсказания
 */
interface PredictionDetails {
  ensemble?: SourceDetails;
  traditional?: SourceDetails;
  reinforcement?: SourceDetails;
  [key: string]: any;
}

/**
 * Интерфейс для полного предсказания
 */
export interface PredictionData {
  score?: number;
  confidence?: number;
  recommendation?: string;
  summary?: string;
  details?: PredictionDetails | string;
  horizons?: any;
  agreement?: number;
  [key: string]: any;
}

/**
 * Получить название источника на русском
 */
function getSourceName(key: string): string {
  const names: { [key: string]: string } = {
    ensemble: 'Ансамбль',
    traditional: 'Традиционная нейросеть',
    reinforcement: 'Обучение с подкреплением'
  };
  return names[key] || key;
}

/**
 * Форматировать информацию об источнике предсказания
 */
function formatSourceInfo(key: string, value: SourceDetails): string {
  const sourceName = getSourceName(key);
  const parts: string[] = [];
  
  if (value.score !== undefined && value.score !== null) {
    parts.push(`Score: ${(value.score * 100).toFixed(1)}%`);
  }
  
  if (value.confidence !== undefined && value.confidence !== null) {
    parts.push(`Conf: ${(value.confidence * 100).toFixed(1)}%`);
  }
  
  if (value.recommendation) {
    parts.push(`Рекомендация: ${value.recommendation}`);
  }
  
  return parts.length > 0 ? `${sourceName}: ${parts.join(', ')}` : sourceName;
}

/**
 * Форматировать детали предсказания в структурированный список
 * @param details - Объект details из предсказания
 * @returns JSX элемент со структурированным списком
 */
export function formatPredictionDetails(details: PredictionDetails | string | undefined | null): React.ReactNode {
  if (!details) return null;
  
  // Если details - строка, просто возвращаем её
  if (typeof details === 'string') {
    return <div className="text-xs text-500">{details}</div>;
  }
  
  // Если details - объект, форматируем его структурированно
  if (typeof details === 'object') {
    const sources = ['ensemble', 'traditional', 'reinforcement'];
    const sourceItems = sources
      .filter(key => details[key] && typeof details[key] === 'object')
      .map(key => ({
        key,
        name: getSourceName(key),
        data: details[key] as SourceDetails
      }));
    
    if (sourceItems.length === 0) return null;
    
    return (
      <div className="text-xs text-500 mt-2">
        <div className="font-medium mb-1">Источники предсказания:</div>
        <ul className="list-none pl-0 mt-1 mb-0" style={{ lineHeight: '1.6' }}>
          {sourceItems.map((item) => {
            const parts: string[] = [];
            
            if (item.data.score !== undefined && item.data.score !== null) {
              parts.push(`Score: ${(item.data.score * 100).toFixed(1)}%`);
            }
            
            if (item.data.confidence !== undefined && item.data.confidence !== null) {
              parts.push(`Уверенность: ${(item.data.confidence * 100).toFixed(1)}%`);
            }
            
            if (item.data.recommendation) {
              parts.push(`Рекомендация: ${item.data.recommendation}`);
            }
            
            return (
              <li key={item.key} className="mb-1">
                <span className="font-medium">{item.name}:</span>{' '}
                {parts.length > 0 ? parts.join(', ') : 'Данные недоступны'}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
  
  return null;
}

/**
 * Форматировать горизонты предсказания (если есть)
 */
export function formatPredictionHorizons(horizons: any): React.ReactNode {
  if (!horizons || typeof horizons !== 'object') return null;
  
  const horizonKeys = ['shortTerm', 'mediumTerm', 'longTerm'];
  const horizonNames: { [key: string]: string } = {
    shortTerm: 'Краткосрочный (1-3 дня)',
    mediumTerm: 'Среднесрочный (1-4 недели)',
    longTerm: 'Долгосрочный (2-3 месяца)'
  };
  
  const horizonItems = horizonKeys
    .filter(key => horizons[key])
    .map(key => ({
      key,
      name: horizonNames[key] || key,
      data: horizons[key]
    }));
  
  if (horizonItems.length === 0) return null;
  
  return (
    <div className="text-xs text-500 mt-2">
      <div className="font-medium mb-1">Прогнозы по горизонтам:</div>
      <ul className="list-none pl-0 mt-1 mb-0" style={{ lineHeight: '1.6' }}>
        {horizonItems.map((item) => {
          const rec = item.data.recommendation || 'HOLD';
          const score = item.data.score !== undefined 
            ? `${(item.data.score * 100).toFixed(1)}%` 
            : '—';
          
          return (
            <li key={item.key} className="mb-1">
              <span className="font-medium">{item.name}:</span>{' '}
              {rec} ({score})
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Получить полное форматированное представление предсказания
 * @param prediction - Объект предсказания
 * @returns JSX элемент с полной информацией о предсказании
 */
export function formatFullPrediction(prediction: PredictionData | null | undefined): React.ReactNode {
  if (!prediction) return null;
  
  return (
    <div className="flex flex-column gap-2">
      {/* Summary */}
      {prediction.summary && typeof prediction.summary === 'string' && (
        <div className="text-xs text-500">
          {prediction.summary}
        </div>
      )}
      
      {/* Details */}
      {formatPredictionDetails(prediction.details)}
      
      {/* Horizons */}
      {formatPredictionHorizons(prediction.horizons)}
      
      {/* Agreement */}
      {prediction.agreement !== undefined && prediction.agreement !== null && (
        <div className="text-xs text-500 mt-1">
          Согласованность: {(prediction.agreement * 100).toFixed(0)}%
        </div>
      )}
    </div>
  );
}

/**
 * Получить краткую информацию об источниках (для компактного отображения)
 */
export function getSourcesSummary(details: PredictionDetails | string | undefined | null): string {
  if (!details || typeof details === 'string') return '';
  
  const sources = ['ensemble', 'traditional', 'reinforcement'];
  const summaries = sources
    .filter(key => details[key] && typeof details[key] === 'object')
    .map(key => formatSourceInfo(key, details[key] as SourceDetails));
  
  return summaries.join(' | ');
}

