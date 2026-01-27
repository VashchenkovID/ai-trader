import React from 'react';
import { Card } from 'primereact/card';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { Badge } from 'primereact/badge';
import { useWebSocketData, TradingSignal } from '../WebSocketDataProvider';

interface TradingSignalsWidgetProps {
  className?: string;
  maxSignals?: number;
}

const TradingSignalsWidget: React.FC<TradingSignalsWidgetProps> = ({ 
  className = '',
  maxSignals = 10
}) => {
  const { tradingSignals, isConnected } = useWebSocketData();

  const displayedSignals = tradingSignals.slice(0, maxSignals);

  const signalTypeTemplate = (rowData: TradingSignal) => {
    const severity = rowData.signalType === 'BUY' ? 'success' : 'danger';
    return (
      <Tag value={rowData.signalType} severity={severity} />
    );
  };

  const confidenceTemplate = (rowData: TradingSignal) => {
    const percent = (rowData.confidence * 100).toFixed(1);
    const color = rowData.confidence > 0.7 ? 'green' : rowData.confidence > 0.5 ? 'orange' : 'red';
    return (
      <span className={`text-${color}-500 font-semibold`}>
        {percent}%
      </span>
    );
  };

  const priceTemplate = (rowData: TradingSignal) => {
    return (
      <div className="flex flex-column gap-1">
        <div className="text-sm">
          <span className="text-600">Вход: </span>
          <span className="font-semibold">{rowData.entryPrice.toFixed(2)} ₽</span>
        </div>
        {rowData.stopLoss && (
          <div className="text-sm text-red-500">
            <span className="text-600">SL: </span>
            <span>{rowData.stopLoss.toFixed(2)} ₽</span>
          </div>
        )}
        {rowData.takeProfit && (
          <div className="text-sm text-green-500">
            <span className="text-600">TP: </span>
            <span>{rowData.takeProfit.toFixed(2)} ₽</span>
          </div>
        )}
      </div>
    );
  };

  const timeTemplate = (rowData: TradingSignal) => {
    const date = new Date(rowData.timestamp);
    return (
      <span className="text-sm text-600">
        {date.toLocaleTimeString('ru-RU')}
      </span>
    );
  };

  return (
    <Card 
      title={
        <div className="flex align-items-center justify-content-between">
          <span>📊 Торговые сигналы</span>
          <Badge 
            value={tradingSignals.length} 
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
      
      {isConnected && displayedSignals.length === 0 && (
        <div className="text-center p-4 text-500">
          <i className="pi pi-info-circle text-2xl mb-2"></i>
          <p>Нет новых торговых сигналов</p>
        </div>
      )}

      {isConnected && displayedSignals.length > 0 && (
        <DataTable
          value={displayedSignals}
          paginator={displayedSignals.length > 5}
          rows={5}
          size="small"
          emptyMessage="Нет сигналов"
        >
          <Column field="ticker" header="Тикер" style={{ minWidth: '80px' }} />
          <Column field="name" header="Инструмент" style={{ minWidth: '150px' }} />
          <Column 
            field="signalType" 
            header="Сигнал" 
            body={signalTypeTemplate}
            style={{ minWidth: '100px' }}
          />
          <Column 
            field="confidence" 
            header="Уверенность" 
            body={confidenceTemplate}
            style={{ minWidth: '120px' }}
          />
          <Column 
            header="Цены" 
            body={priceTemplate}
            style={{ minWidth: '150px' }}
          />
          <Column 
            field="timestamp" 
            header="Время" 
            body={timeTemplate}
            style={{ minWidth: '100px' }}
          />
        </DataTable>
      )}
    </Card>
  );
};

export default TradingSignalsWidget;

