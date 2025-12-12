import React from 'react';
import { translateRecommendation } from '../../utils/recommendationTranslator';

interface Horizon {
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  score: number;
  confidence: number;
  name: string;
  description: string;
}

interface Recommendation {
  horizons?: {
    shortTerm?: Horizon;
    mediumTerm?: Horizon;
    longTerm?: Horizon;
  };
  analysis?: {
    horizons?: {
      shortTerm?: Horizon;
      mediumTerm?: Horizon;
      longTerm?: Horizon;
    };
  };
  explanation?: {
    details?: {
      ensemble?: {
        horizons?: {
          shortTerm?: Horizon;
          mediumTerm?: Horizon;
          longTerm?: Horizon;
        };
      };
      horizons?: {
        shortTerm?: Horizon;
        mediumTerm?: Horizon;
        longTerm?: Horizon;
      };
    };
    horizons?: {
      shortTerm?: Horizon;
      mediumTerm?: Horizon;
      longTerm?: Horizon;
    };
  };
}

interface HorizonsTemplateProps {
  rowData: Recommendation;
}

const HorizonsTemplate: React.FC<HorizonsTemplateProps> = ({ rowData }) => {
  // Извлекаем горизонты из разных возможных мест (в порядке приоритета)
  let horizons = null;
  
  // Приоритет 1: прямое поле horizons (если передано из Recommendations.tsx)
  if (rowData.horizons) {
    horizons = rowData.horizons;
  }
  // Приоритет 2: analysis.horizons (как в БД)
  else if (rowData.analysis?.horizons) {
    horizons = rowData.analysis.horizons;
  }
  // Приоритет 3: explanation.details.ensemble.horizons
  else if (rowData.explanation?.details?.ensemble?.horizons) {
    horizons = rowData.explanation.details.ensemble.horizons;
  }
  // Приоритет 4: explanation.details.horizons
  else if (rowData.explanation?.details?.horizons) {
    horizons = rowData.explanation.details.horizons;
  }
  // Приоритет 5: explanation.horizons
  else if (rowData.explanation?.horizons) {
    horizons = rowData.explanation.horizons;
  }

  if (!horizons || typeof horizons !== 'object') {
    return <span className="text-500">—</span>;
  }

  const { shortTerm, mediumTerm, longTerm } = horizons;

  const getTextColor = (rec: string) => {
    if (rec === 'BUY') return '#22c55e'; // green-500 (success)
    if (rec === 'SELL') return '#ef4444'; // red-500 (danger)
    return '#3b82f6'; // blue-500 (info)
  };

  return (
    <div className="flex flex-column gap-1">
      {shortTerm && (
        <div className="text-xs" style={{ color: getTextColor(shortTerm.recommendation), fontWeight: 500 }}>
          {shortTerm.name}: {translateRecommendation(shortTerm.recommendation)}
        </div>
      )}
      {mediumTerm && (
        <div className="text-xs" style={{ color: getTextColor(mediumTerm.recommendation), fontWeight: 500 }}>
          {mediumTerm.name}: {translateRecommendation(mediumTerm.recommendation)}
        </div>
      )}
      {longTerm && (
        <div className="text-xs" style={{ color: getTextColor(longTerm.recommendation), fontWeight: 500 }}>
          {longTerm.name}: {translateRecommendation(longTerm.recommendation)}
        </div>
      )}
    </div>
  );
};

export default HorizonsTemplate;

