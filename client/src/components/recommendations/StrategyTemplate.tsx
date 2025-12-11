import React from 'react';

interface Recommendation {
  explanation?: any;
  analysis?: any;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
}

interface StrategyTemplateProps {
  rowData: Recommendation;
}

const StrategyTemplate: React.FC<StrategyTemplateProps> = ({ rowData }) => {
  // Извлекаем описание стратегии из explanation
  let strategyText = '';

  if (rowData.explanation) {
    if (typeof rowData.explanation === 'string') {
      strategyText = rowData.explanation;
    } else if (typeof rowData.explanation === 'object') {
      // Приоритет: summary > краткое описание из других полей
      if (rowData.explanation.summary) {
        strategyText = rowData.explanation.summary;
      } else if (rowData.explanation.brief) {
        strategyText = rowData.explanation.brief;
      } else if (rowData.explanation.keyFactors && Array.isArray(rowData.explanation.keyFactors)) {
        strategyText = `Ключевые факторы: ${rowData.explanation.keyFactors.slice(0, 2).join(', ')}`;
      } else if (rowData.explanation.reason) {
        strategyText = rowData.explanation.reason;
      }
    }
  }

  // Если нет explanation, используем данные из analysis
  if (!strategyText && rowData.analysis) {
    if (typeof rowData.analysis === 'object') {
      if (rowData.analysis.strategy) {
        strategyText = rowData.analysis.strategy;
      } else if (rowData.analysis.reason) {
        strategyText = rowData.analysis.reason;
      }
    }
  }

  // Если все еще нет текста, используем дефолтное описание на основе рекомендации
  if (!strategyText) {
    if (rowData.recommendation === 'BUY') {
      strategyText = 'Сигнал на покупку на основе технического и фундаментального анализа';
    } else if (rowData.recommendation === 'SELL') {
      strategyText = 'Рекомендация к продаже для защиты капитала';
    } else {
      strategyText = 'Рекомендация к удержанию позиции';
    }
  }

  // Ограничиваем длину текста для таблицы
  const maxLength = 100;
  const displayText = strategyText.length > maxLength
    ? strategyText.substring(0, maxLength) + '...'
    : strategyText;

  return (
    <div className="flex flex-column" style={{ maxWidth: '300px' }}>
      <div className="text-sm text-600" title={strategyText}>
        {displayText}
      </div>
      {rowData.explanation?.timeframe && (
        <div className="text-xs text-500 mt-1">
          Горизонт: {rowData.explanation.timeframe}
        </div>
      )}
    </div>
  );
};

export default StrategyTemplate;

