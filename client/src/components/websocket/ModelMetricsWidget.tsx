import React from 'react';
import { Card } from 'primereact/card';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Badge } from 'primereact/badge';
import { ProgressBar } from 'primereact/progressbar';
import { useWebSocketData, ModelMetrics } from '../WebSocketDataProvider';

interface ModelMetricsWidgetProps {
  className?: string;
  maxMetrics?: number;
}

const ModelMetricsWidget: React.FC<ModelMetricsWidgetProps> = ({ 
  className = '',
  maxMetrics = 10
}) => {
  const { modelMetrics, isConnected } = useWebSocketData();

  const displayedMetrics = modelMetrics.slice(0, maxMetrics);

  const accuracyTemplate = (rowData: ModelMetrics) => {
    if (rowData.accuracy === null) return <span className="text-500">—</span>;
    const percent = (rowData.accuracy * 100).toFixed(1);
    const color = rowData.accuracy > 0.7 ? 'green' : rowData.accuracy > 0.5 ? 'orange' : 'red';
    return (
      <div className="flex align-items-center gap-2">
        <span className={`text-${color}-500 font-semibold`}>{percent}%</span>
        <ProgressBar 
          value={rowData.accuracy * 100} 
          showValue={false}
          style={{ width: '60px', height: '8px' }}
        />
      </div>
    );
  };

  const maeTemplate = (rowData: ModelMetrics) => {
    if (rowData.mae === null) return <span className="text-500">—</span>;
    return (
      <span className="text-sm">{rowData.mae.toFixed(4)}</span>
    );
  };

  const rmseTemplate = (rowData: ModelMetrics) => {
    if (rowData.rmse === null) return <span className="text-500">—</span>;
    return (
      <span className="text-sm">{rowData.rmse.toFixed(4)}</span>
    );
  };

  const winRateTemplate = (rowData: ModelMetrics) => {
    if (rowData.winRate === null) return <span className="text-500">—</span>;
    const percent = (rowData.winRate * 100).toFixed(1);
    return (
      <span className="text-sm">{percent}%</span>
    );
  };

  const predictionsTemplate = (rowData: ModelMetrics) => {
    return (
      <div className="flex flex-column gap-1">
        <span className="text-sm">
          Всего: <strong>{rowData.totalPredictions}</strong>
        </span>
        <span className="text-sm text-green-500">
          Верных: <strong>{rowData.correctPredictions}</strong>
        </span>
      </div>
    );
  };

  const modelTypeTemplate = (rowData: ModelMetrics) => {
    const labels: Record<string, string> = {
      neural_network: 'Нейросеть',
      ensemble: 'Ансамбль',
      meta_learning: 'Мета-обучение',
      reinforcement_learning: 'RL'
    };
    
    return (
      <Badge 
        value={labels[rowData.modelType] || rowData.modelType}
        severity="info"
      />
    );
  };

  return (
    <Card 
      title={
        <div className="flex align-items-center justify-content-between">
          <span>📈 Метрики моделей</span>
          <Badge 
            value={modelMetrics.length} 
            severity={isConnected ? 'success' : 'info'}
          />
        </div>
      }
      className={className}
    >
      {!isConnected && (
        <div className="text-center p-3 text-500">
          <i className="pi pi-exclamation-triangle mr-2"></i>
          Нет подключения к серверу
        </div>
      )}
      
      {isConnected && displayedMetrics.length === 0 && (
        <div className="text-center p-4 text-500">
          <i className="pi pi-info-circle text-2xl mb-2"></i>
          <p>Метрики моделей будут отображаться здесь</p>
        </div>
      )}

      {isConnected && displayedMetrics.length > 0 && (
        <DataTable
          value={displayedMetrics}
          paginator={displayedMetrics.length > 5}
          rows={5}
          size="small"
          emptyMessage="Нет метрик"
        >
          <Column 
            field="modelType" 
            header="Модель" 
            body={modelTypeTemplate}
            style={{ minWidth: '120px' }}
          />
          <Column 
            field="instrument" 
            header="Инструмент" 
            style={{ minWidth: '100px' }}
          />
          <Column 
            field="accuracy" 
            header="Точность" 
            body={accuracyTemplate}
            style={{ minWidth: '150px' }}
          />
          <Column 
            field="mae" 
            header="MAE" 
            body={maeTemplate}
            style={{ minWidth: '100px' }}
          />
          <Column 
            field="rmse" 
            header="RMSE" 
            body={rmseTemplate}
            style={{ minWidth: '100px' }}
          />
          <Column 
            field="winRate" 
            header="Win Rate" 
            body={winRateTemplate}
            style={{ minWidth: '100px' }}
          />
          <Column 
            header="Предсказания" 
            body={predictionsTemplate}
            style={{ minWidth: '120px' }}
          />
        </DataTable>
      )}
    </Card>
  );
};

export default ModelMetricsWidget;

