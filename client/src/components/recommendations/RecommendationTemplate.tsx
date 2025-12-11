import React from 'react';
import { Tag } from 'primereact/tag';
import { translateRecommendation } from '../../utils/recommendationTranslator';

interface Recommendation {
  recommendation: 'BUY' | 'SELL' | 'HOLD';
}

interface RecommendationTemplateProps {
  rowData: Recommendation;
}

const RecommendationTemplate: React.FC<RecommendationTemplateProps> = ({ rowData }) => {
  const severity =
    rowData.recommendation === 'BUY' ? 'success' :
    rowData.recommendation === 'SELL' ? 'danger' : 'info';

  return (
    <Tag value={translateRecommendation(rowData.recommendation)} severity={severity as any} />
  );
};

export default RecommendationTemplate;

