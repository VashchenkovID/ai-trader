import React, { useState, useEffect } from 'react';
import { Card } from '../../ui/Card/Card.tsx';
import { Table, TableColumn } from '../../ui/Table/Table.tsx';
import { Badge } from '../../ui/Badge/Badge.tsx';
import { Button } from '../../ui/Button/Button.tsx';
import { Skeleton } from '../../ui/Skeleton/Skeleton.tsx';
import { Message } from 'primereact/message';
import { Select } from '../../ui/Select/Select.tsx';
import { apiService } from '../../../services/apiService.ts';
import { useNavigate } from 'react-router-dom';
import './CachedSignalsCard.css';

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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  };

  const columns: TableColumn<CachedSignal>[] = [
    {
      key: 'ticker',
      header: 'Тикер',
      render: (_, row) => {
        const ticker = row.ticker || row.figi?.substring(0, 8) || 'N/A';
        return (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => row.figi && navigate(`/stock/${row.figi}`)}
            className="ticker-button"
          >
            {ticker}
          </Button>
        );
      },
      width: '100px'
    },
    {
      key: 'name',
      header: 'Инструмент',
      accessor: (row) => row.name || row.ticker || 'N/A',
      width: '150px'
    },
    {
      key: 'direction',
      header: 'Сигнал',
      render: (_, row) => {
        const isBuy = row.direction === 'SIGNAL_DIRECTION_BUY';
        const label = isBuy ? 'ПОКУПКА' : 'ПРОДАЖА';
        return (
          <Badge variant={isBuy ? 'success' : 'error'} size="sm">
            {label}
          </Badge>
        );
      },
      width: '120px'
    },
    {
      key: 'strategyName',
      header: 'Стратегия',
      accessor: (row) => row.strategyName || row.strategyId || 'N/A',
      width: '150px'
    },
    {
      key: 'probability',
      header: 'Вероятность',
      render: (_, row) => {
        const percent = (row.probability || 0).toFixed(0);
        const colorClass = row.probability > 70 ? 'probability-high' : row.probability > 50 ? 'probability-medium' : 'probability-low';
        return (
          <span className={`font-semibold ${colorClass}`}>
            {percent}%
          </span>
        );
      },
      align: 'right',
      width: '100px'
    },
    {
      key: 'prices',
      header: 'Цены',
      render: (_, row) => {
        return (
          <div className="price-column">
            {row.initialPrice && (
              <div className="price-row">
                <span className="price-label">Вход: </span>
                <span className="price-value">{formatCurrency(row.initialPrice)}</span>
              </div>
            )}
            {row.targetPrice && (
              <div className="price-row price-success">
                <span className="price-label">Цель: </span>
                <span>{formatCurrency(row.targetPrice)}</span>
              </div>
            )}
            {row.stoploss && (
              <div className="price-row price-error">
                <span className="price-label">Стоп: </span>
                <span>{formatCurrency(row.stoploss)}</span>
              </div>
            )}
          </div>
        );
      },
      width: '150px'
    },
    {
      key: 'createDt',
      header: 'Дата создания',
      render: (_, row) => {
        const date = new Date(row.createDt);
        return (
          <div className="date-column">
            <span className="date-primary">{date.toLocaleDateString('ru-RU')}</span>
            <span className="date-secondary">{date.toLocaleTimeString('ru-RU')}</span>
          </div>
        );
      },
      width: '140px'
    }
  ];

  return (
    <Card 
      variant="default"
      className={`cached-signals-card ${className}`}
      header={
        <div className="card-header">
          <span>Торговые сигналы</span>
          <div className="card-header-actions">
            <Badge variant="info" size="sm">{signals.length}</Badge>
            <Button
              variant="ghost"
              size="sm"
              icon={loading ? <i className="pi pi-spin pi-spinner"></i> : <i className="pi pi-refresh"></i>}
              onClick={loadSignals}
              loading={loading}
              title="Обновить"
            />
          </div>
        </div>
      }
    >
      <div className="signals-filter">
        <span className="signals-filter-label">Фильтр:</span>
        <Select
          size="sm"
          options={directionOptions}
          value={filterDirection}
          onChange={(e) => setFilterDirection(e.target.value)}
          className="filter-select"
          fullWidth={false}
        />
      </div>

      {error && (
        <Message severity="error" text={error} className="mb-3" />
      )}

      {loading && (
        <div className="skeleton-container">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} variant="rectangular" size="md" className="skeleton-item" />
          ))}
        </div>
      )}

      {!loading && (
        <Table
          data={signals}
          columns={columns}
          size="lg"
          hoverable
          sortable
          emptyMessage="Нет записанных торговых сигналов"
        />
      )}
    </Card>
  );
};

export default CachedSignalsCard;

