import React from 'react';
import { TabView, TabPanel } from 'primereact/tabview';
import TradingRequestManager from '../components/TradingRequestManager';
import RecommendationsViewer from '../components/RecommendationsViewer';
import TradingModeStats from '../components/TradingModeStats';

const TradingRequests: React.FC = () => {
  return (
    <div className="trading-requests-page p-4">
      <TabView>
        <TabPanel header="📊 Рекомендации AI">
          <RecommendationsViewer />
        </TabPanel>
        <TabPanel header="🎯 Торговые заявки">
          <TradingRequestManager />
        </TabPanel>
        <TabPanel header="📈 Статистика режимов">
          <TradingModeStats />
        </TabPanel>
      </TabView>
    </div>
  );
};

export default TradingRequests;
