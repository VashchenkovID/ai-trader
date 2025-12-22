import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card/Card';
import { Table, TableColumn } from '../ui/Table/Table';
import { Badge } from '../ui/Badge/Badge';
import { Button } from '../ui/Button/Button';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { Message } from 'primereact/message';
import { Select } from '../ui/Select/Select';
import { apiService } from '../../services/apiService';
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
            style={{ padding: 0, minHeight: 'auto', height: 'auto' }}
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
        const color = row.probability > 70 ? 'var(--color-accent-success)' : row.probability > 50 ? 'var(--color-accent-warning)' : 'var(--color-accent-error)';
        return (
          <span className="font-semibold" style={{ color }}>
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
          <div className="flex flex-column gap-1">
            {row.initialPrice && (
              <div className="text-sm">
                <span className="number-text-secondary">Вход: </span>
                <span className="font-semibold number-text-primary">{formatCurrency(row.initialPrice)}</span>
              </div>
            )}
            {row.targetPrice && (
              <div className="text-sm number-success">
                <span className="number-text-secondary">Цель: </span>
                <span>{formatCurrency(row.targetPrice)}</span>
              </div>
            )}
            {row.stoploss && (
              <div className="text-sm number-error">
                <span className="number-text-secondary">Стоп: </span>
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
          <div className="flex flex-column">
            <span className="text-sm number-text-primary">{date.toLocaleDateString('ru-RU')}</span>
            <span className="text-xs number-text-tertiary">{date.toLocaleTimeString('ru-RU')}</span>
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
        <div className="flex align-items-center justify-content-between flex-wrap gap-2">
          <span>Торговые сигналы</span>
          <div className="flex align-items-center gap-2">
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
          style={{ width: '140px' }}
          fullWidth={false}
        />
      </div>

      {error && (
        <Message severity="error" text={error} className="mb-3" />
      )}

      {loading && (
        <div className="grid">
          {[1, 2, 3].map((item) => (
            <div key={item} className="col-12">
              <Skeleton variant="rectangular" size="md" style={{ width: '100%', height: '4rem', marginBottom: '0.5rem' }} />
            </div>
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

