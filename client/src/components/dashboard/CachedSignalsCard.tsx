import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { Badge } from 'primereact/badge';
import { Button } from 'primereact/button';
import { Skeleton } from 'primereact/skeleton';
import { Message } from 'primereact/message';
import { Dropdown } from 'primereact/dropdown';
import { apiService } from '../../services/apiService';
import { useNavigate } from 'react-router-dom';

interface CachedSignal {
  signalId: string;
  strategyId: string;
  strategyName: string;
  figi: string;
  ticker?: string;
  name?: string;
  createDt: string;
  endDt: string;
  direction: string;
  initialPrice: number | null;
  targetPrice: number | null;
  stoploss: number | null;
  probability: number;
  name?: string;
  info?: any;
}

interface CachedSignalsCardProps {
  className?: string;
  maxSignals?: number;
}

const CachedSignalsCard: React.FC<CachedSignalsCardProps> = ({ 
  className = '',
  maxSignals = 20
}) => {
  const [signals, setSignals] = useState<CachedSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterDirection, setFilterDirection] = useState<string>('all');
  const navigate = useNavigate();

  const directionOptions = [
    { label: 'Все', value: 'all' },
    { label: 'Покупка', value: 'SIGNAL_DIRECTION_BUY' },
    { label: 'Продажа', value: 'SIGNAL_DIRECTION_SELL' }
  ];

  useEffect(() => {
    loadSignals();
  }, [filterDirection]);

  const loadSignals = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const direction = filterDirection === 'all' ? undefined : filterDirection;
      const result = await apiService.getAllSignals(maxSignals, false, direction);
      
      if (result.success && Array.isArray(result.data)) {
        setSignals(result.data);
      } else {
        setSignals([]);
      }
    } catch (err: any) {
      console.error('Error loading cached signals:', err);
      setError(err.message || 'Ошибка загрузки сигналов');
      setSignals([]);
    } finally {
      setLoading(false);
    }
  };

  const directionTemplate = (rowData: CachedSignal) => {
    const isBuy = rowData.direction === 'SIGNAL_DIRECTION_BUY';
    const severity = isBuy ? 'success' : 'danger';
    const label = isBuy ? 'ПОКУПКА' : 'ПРОДАЖА';
    return <Tag value={label} severity={severity} />;
  };

  const probabilityTemplate = (rowData: CachedSignal) => {
    const percent = (rowData.probability || 0).toFixed(0);
    const color = rowData.probability > 70 ? 'green' : rowData.probability > 50 ? 'orange' : 'red';
    return (
      <span className={`text-${color}-500 font-semibold`}>
        {percent}%
      </span>
    );
  };

  const priceTemplate = (rowData: CachedSignal) => {
    return (
      <div className="flex flex-column gap-1">
        {rowData.initialPrice && (
          <div className="text-sm">
            <span className="text-600">Вход: </span>
            <span className="font-semibold">{rowData.initialPrice.toFixed(2)} ₽</span>
          </div>
        )}
        {rowData.targetPrice && (
          <div className="text-sm text-green-500">
            <span className="text-600">Цель: </span>
            <span>{rowData.targetPrice.toFixed(2)} ₽</span>
          </div>
        )}
        {rowData.stoploss && (
          <div className="text-sm text-red-500">
            <span className="text-600">Стоп: </span>
            <span>{rowData.stoploss.toFixed(2)} ₽</span>
          </div>
        )}
      </div>
    );
  };

  const dateTemplate = (rowData: CachedSignal) => {
    const date = new Date(rowData.createDt);
    return (
      <div className="flex flex-column">
        <span className="text-sm">{date.toLocaleDateString('ru-RU')}</span>
        <span className="text-xs text-500">{date.toLocaleTimeString('ru-RU')}</span>
      </div>
    );
  };

  const tickerTemplate = (rowData: CachedSignal) => {
    const ticker = rowData.ticker || rowData.figi?.substring(0, 8) || 'N/A';
    return (
      <Button
        label={ticker}
        link
        className="p-0 text-primary"
        onClick={() => rowData.figi && navigate(`/stock/${rowData.figi}`)}
      />
    );
  };

  const strategyTemplate = (rowData: CachedSignal) => {
    return (
      <span className="text-sm text-600" title={rowData.strategyName}>
        {rowData.strategyName || rowData.strategyId || 'N/A'}
      </span>
    );
  };

  return (
    <Card 
      title={
        <div className="flex align-items-center justify-content-between flex-wrap gap-2">
          <span>📊 Торговые сигналы</span>
          <div className="flex align-items-center gap-2">
            <Badge value={signals.length} severity="info" />
            <Button
              icon="pi pi-refresh"
              className="p-button-text p-button-sm"
              onClick={loadSignals}
              loading={loading}
              tooltip="Обновить"
              tooltipOptions={{ position: 'top' }}
            />
          </div>
        </div>
      }
      className={className}
    >
      <div className="mb-3">
        <div className="flex align-items-center gap-2">
          <span className="text-600 text-sm">Фильтр:</span>
          <Dropdown
            value={filterDirection}
            options={directionOptions}
            onChange={(e) => setFilterDirection(e.value)}
            className="w-12rem"
          />
        </div>
      </div>

      {error && (
        <Message severity="error" text={error} className="mb-3" />
      )}

      {loading && (
        <div className="grid">
          {[1, 2, 3].map((item) => (
            <div key={item} className="col-12">
              <Skeleton height="4rem" className="mb-2" />
            </div>
          ))}
        </div>
      )}

      {!loading && signals.length === 0 && (
        <div className="text-center p-4 text-500">
          <i className="pi pi-info-circle text-2xl mb-2"></i>
          <p>Нет записанных торговых сигналов</p>
        </div>
      )}

      {!loading && signals.length > 0 && (
        <DataTable
          value={signals}
          paginator={signals.length > 10}
          rows={10}
          size="small"
          emptyMessage="Нет сигналов"
          className="p-datatable-sm"
        >
          <Column field="ticker" header="Тикер" body={tickerTemplate} style={{ minWidth: '80px' }} />
          <Column field="name" header="Инструмент" style={{ minWidth: '150px' }} />
          <Column 
            field="direction" 
            header="Сигнал" 
            body={directionTemplate}
            style={{ minWidth: '100px' }}
          />
          <Column 
            field="strategyName" 
            header="Стратегия" 
            body={strategyTemplate}
            style={{ minWidth: '120px' }}
          />
          <Column 
            field="probability" 
            header="Вероятность" 
            body={probabilityTemplate}
            style={{ minWidth: '100px' }}
          />
          <Column 
            header="Цены" 
            body={priceTemplate}
            style={{ minWidth: '150px' }}
          />
          <Column 
            field="createDt" 
            header="Дата создания" 
            body={dateTemplate}
            style={{ minWidth: '120px' }}
          />
        </DataTable>
      )}
    </Card>
  );
};

export default CachedSignalsCard;

