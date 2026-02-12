import React from 'react';
import HorizonCards from './HorizonCards';
import './ForecastHorizonsTab.css';

interface ForecastHorizonsTabProps {
  horizons?: {
    shortTerm?: any;
    mediumTerm?: any;
    longTerm?: any;
  };
  agreement?: number | null;
}

const ForecastHorizonsTab: React.FC<ForecastHorizonsTabProps> = ({
  horizons,
  agreement
}) => {
  if (!horizons || (!horizons.shortTerm && !horizons.mediumTerm && !horizons.longTerm)) {
    return (
      <div className="forecast-horizons-tab__empty">
        <p>Прогнозы по горизонтам недоступны</p>
        <p className="forecast-horizons-tab__empty-hint">
          Запустите анализ для получения прогнозов
        </p>
      </div>
    );
  }

  return (
    <div className="forecast-horizons-tab">
      <HorizonCards horizons={horizons} agreement={agreement} />
    </div>
  );
};

export default ForecastHorizonsTab;

