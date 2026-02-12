import React from 'react';
import FundamentalMetricsWidget from './FundamentalMetricsWidget';
// import { Chart } from '../ui';
import './FundamentalAnalysisTab.css';

interface FundamentalAnalysisTabProps {
  figi: string;
  fundamentalData?: {
    metrics?: any;
    financialHistory?: any[];
    sectorComparison?: any;
  };
  currency?: string;
}

const FundamentalAnalysisTab: React.FC<FundamentalAnalysisTabProps> = ({
  // figi,
  fundamentalData,
  currency = 'RUB'
}) => {
  if (!fundamentalData) {
    return (
      <div className="fundamental-analysis-tab__empty">
        <p>Данные фундаментального анализа недоступны</p>
        <p className="fundamental-analysis-tab__empty-hint">
          Фундаментальные данные будут загружены автоматически
        </p>
      </div>
    );
  }

  return (
    <div className="fundamental-analysis-tab">
      <div className="fundamental-analysis-tab__metrics">
        <FundamentalMetricsWidget 
          metrics={fundamentalData.metrics || {}}
          currency={currency}
        />
      </div>

      {fundamentalData.sectorComparison && (
        <div className="fundamental-analysis-tab__comparison">
          <h3 className="fundamental-analysis-tab__section-title">Сравнение с сектором</h3>
          <div className="fundamental-analysis-tab__comparison-content">
            {/* Здесь можно добавить графики сравнения */}
            <p className="fundamental-analysis-tab__comparison-note">
              Детальное сравнение с сектором будет доступно после загрузки данных
            </p>
          </div>
        </div>
      )}

      {fundamentalData.financialHistory && fundamentalData.financialHistory.length > 0 && (
        <div className="fundamental-analysis-tab__history">
          <h3 className="fundamental-analysis-tab__section-title">История финансовых показателей</h3>
          <div className="fundamental-analysis-tab__history-content">
            {/* Здесь можно добавить графики истории */}
            <p className="fundamental-analysis-tab__history-note">
              Графики истории финансовых показателей будут доступны после загрузки данных
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FundamentalAnalysisTab;

