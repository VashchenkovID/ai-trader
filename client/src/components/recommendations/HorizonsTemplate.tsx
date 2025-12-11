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
  explanation?: {
    details?: {
      ensemble?: {
        horizons?: {
          shortTerm?: Horizon;
          mediumTerm?: Horizon;
          longTerm?: Horizon;
        };
      };
    };
  };
}

interface HorizonsTemplateProps {
  rowData: Recommendation;
}

const HorizonsTemplate: React.FC<HorizonsTemplateProps> = ({ rowData }) => {
  const explanationObj = rowData.explanation?.details?.ensemble;
  const horizons = explanationObj?.horizons || null;

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

