import React from 'react';
import { getConfidenceDescription } from '../../utils/confidenceTranslator';

interface Recommendation {
  confidence: number;
  score: number;
}

interface ConfidenceTemplateProps {
  rowData: Recommendation;
}

const ConfidenceTemplate: React.FC<ConfidenceTemplateProps> = ({ rowData }) => {
  const confidenceDesc = getConfidenceDescription(rowData.confidence, 'confidence');
  const scoreDesc = getConfidenceDescription(rowData.score, 'score');

  return (
    <div className="flex flex-column">
      <div className={`font-medium ${confidenceDesc.color}`}>
        Уверенность: {confidenceDesc.text} ({confidenceDesc.percentage})
      </div>
      <div className={`text-sm ${scoreDesc.color}`}>
        Оценка: {scoreDesc.text} ({scoreDesc.percentage})
      </div>
    </div>
  );
};

export default ConfidenceTemplate;

