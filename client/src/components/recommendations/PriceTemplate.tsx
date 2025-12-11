import React from 'react';

interface Recommendation {
  priceAtAnalysis: number;
  targetPrice?: number;
}

interface PriceTemplateProps {
  rowData: Recommendation;
}

const PriceTemplate: React.FC<PriceTemplateProps> = ({ rowData }) => {
  const formatCurrency = (amount: number) => {
    if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
      return '—';
    }
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  return (
    <div>
      <div className="font-medium">{formatCurrency(rowData.priceAtAnalysis)}</div>
      {rowData.targetPrice && (
        <div className="text-sm text-green-500">Цель: {formatCurrency(rowData.targetPrice)}</div>
      )}
    </div>
  );
};

export default PriceTemplate;

