import React, { useState } from 'react';
import { TabView, TabPanel } from '../components/ui/TabView/TabView';
import PerformanceDashboard from '../components/performance/PerformanceDashboard';
import PerformanceHeatmap from '../components/performance/PerformanceHeatmap';
import SectorAnalysis from '../components/performance/SectorAnalysis';
import BenchmarkComparison from '../components/performance/BenchmarkComparison';
import ReportExport from '../components/performance/ReportExport';
import { performanceApi } from '../services/performanceApi';
import type { ChartPeriod } from '../components/performance/PerformanceChart';
import './Performance.css';

const Performance: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const period: ChartPeriod = 'month'
  const [heatmapData, setHeatmapData] = React.useState<any>(null);
  const [sectorData, setSectorData] = React.useState<any>(null);
  const [heatmapLoading, setHeatmapLoading] = React.useState(false);
  const [sectorLoading, setSectorLoading] = React.useState(false);

  React.useEffect(() => {
    loadHeatmapData();
    loadSectorData();
  }, []);

  const loadHeatmapData = async () => {
    setHeatmapLoading(true);
    try {
      const data = await performanceApi.getPerformanceHeatmapData(period);
      setHeatmapData(data);
    } catch (error) {
      console.error('Error loading heatmap data:', error);
    } finally {
      setHeatmapLoading(false);
    }
  };

  const loadSectorData = async () => {
    setSectorLoading(true);
    try {
      const data = await performanceApi.getSectorAnalysis(period);
      setSectorData(data);
    } catch (error) {
      console.error('Error loading sector data:', error);
    } finally {
      setSectorLoading(false);
    }
  };

  return (
    <div className="performance-page">
      <div className="performance-page-header">
        <h1 className="performance-page-title">Анализ производительности</h1>
      </div>

      <div className="performance-page-content">
        <TabView
          activeIndex={activeTab}
          onTabChange={(e) => setActiveTab(e.index)}
        >
          <TabPanel header="Дашборд">
            <PerformanceDashboard />
          </TabPanel>
          
          <TabPanel header="Heatmap">
            <PerformanceHeatmap
              data={heatmapData}
              loading={heatmapLoading}
            />
          </TabPanel>
          
          <TabPanel header="Секторный анализ">
            <SectorAnalysis
              data={sectorData}
              loading={sectorLoading}
            />
          </TabPanel>
          
          <TabPanel header="Бенчмарки">
            <BenchmarkComparison />
          </TabPanel>
          
          <TabPanel header="Экспорт отчетов">
            <ReportExport />
          </TabPanel>
        </TabView>
      </div>
    </div>
  );
};

export default Performance;

