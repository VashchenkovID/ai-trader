import React from 'react';
import { Card, TabView, TabPanel } from '../ui';
import ForecastHorizonsTab from './ForecastHorizonsTab';
import ForecastHistoryTab from './ForecastHistoryTab';
import TechnicalAnalysisTab from './TechnicalAnalysisTab';
import FundamentalAnalysisTab from './FundamentalAnalysisTab';
import AllSignalsTab from './AllSignalsTab';
import AllNewsTab from './AllNewsTab';
import './StockDetailTabs.css';

interface StockDetailTabsProps {
  figi: string;
  ticker: string;
  // Данные для вкладок
  horizons?: any;
  agreement?: number | null;
  weeklyForecasts?: any[];
  signals?: any[];
  news?: any[];
  technicalIndicators?: any;
  fundamentalData?: any;
  // Callbacks
  onRefreshNews?: () => void;
  isLoadingNews?: boolean;
}

const StockDetailTabs: React.FC<StockDetailTabsProps> = ({
  figi,
  ticker,
  horizons,
  agreement,
  weeklyForecasts,
  signals,
  news,
  technicalIndicators,
  fundamentalData,
  onRefreshNews,
  isLoadingNews
}) => {
  return (
    <Card className="stock-detail-tabs">
      <TabView>
        <TabPanel header="Прогнозы по горизонтам">
          <ForecastHorizonsTab horizons={horizons} agreement={agreement} />
        </TabPanel>
        
        <TabPanel header="История прогнозов">
          <ForecastHistoryTab 
            figi={figi}
            ticker={ticker}
            weeklyForecasts={weeklyForecasts || []}
          />
        </TabPanel>
        
        <TabPanel header="Технический анализ">
          <TechnicalAnalysisTab 
            figi={figi}
            technicalIndicators={technicalIndicators}
            currency={ticker ? undefined : 'RUB'}
          />
        </TabPanel>
        
        <TabPanel header="Фундаментальный анализ">
          <FundamentalAnalysisTab 
            figi={figi}
            fundamentalData={fundamentalData}
            currency="RUB"
          />
        </TabPanel>
        
        <TabPanel header="Все сигналы">
          <AllSignalsTab 
            figi={figi}
            signals={signals || []}
          />
        </TabPanel>
        
        <TabPanel header="Все новости">
          <AllNewsTab 
            figi={figi}
            ticker={ticker}
            news={news || []}
            onRefresh={onRefreshNews}
            isLoading={isLoadingNews}
          />
        </TabPanel>
      </TabView>
    </Card>
  );
};

export default StockDetailTabs;

