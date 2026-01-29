import React, { useState } from 'react';
import { TabView, TabPanel } from '../../components/ui/TabView/TabView';
import WorkerStatusDashboard from '../../components/workers/WorkerStatusDashboard';
import WorkerTimelineChart from '../../components/workers/WorkerTimelineChart';
import WorkerStatsPanel from '../../components/workers/WorkerStatsPanel';
import './WorkerMonitoring.css';

const WorkerMonitoring: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);

  console.log('WorkerMonitoring component rendered');

  return (
    <div className="worker-monitoring-page">
      <div className="worker-monitoring-header">
        <h1 className="worker-monitoring-title">Мониторинг воркеров</h1>
        <p className="worker-monitoring-subtitle">
          Отслеживание статуса, производительности и истории работы воркеров
        </p>
      </div>

      <div className="worker-monitoring-content">
        <TabView
          activeIndex={activeTab}
          onTabChange={(e) => {
            console.log('Tab changed to:', e.index);
            setActiveTab(e.index);
          }}
        >
          <TabPanel header="Текущий статус">
            <WorkerStatusDashboard />
          </TabPanel>
          
          <TabPanel header="График работы">
            <WorkerTimelineChart />
          </TabPanel>
          
          <TabPanel header="Статистика">
            <WorkerStatsPanel />
          </TabPanel>
        </TabView>
      </div>
    </div>
  );
};

export default WorkerMonitoring;

