import React, { useState, useMemo } from 'react';
import { DataTable } from '../ui';
import SignalCard from './SignalCard';
import './AllSignalsTab.css';

interface SignalItem {
  signalId: string;
  strategyId: string;
  strategyName: string;
  createDt: string;
  endDt: string;
  direction: 'SIGNAL_DIRECTION_BUY' | 'SIGNAL_DIRECTION_SELL' | 'SIGNAL_DIRECTION_UNSPECIFIED';
  initialPrice: number | null;
  targetPrice: number | null;
  stoploss: number | null;
  probability: number;
  name: string;
  info?: string;
  isActive: boolean;
}

interface AllSignalsTabProps {
  figi: string;
  signals: SignalItem[];
}

const AllSignalsTab: React.FC<AllSignalsTabProps> = ({
  // figi,
  signals
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [filterDirection, setFilterDirection] = useState<string>('all');

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (price: number) => {
    return price.toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const filteredSignals = useMemo(() => {
    let filtered = signals;
    
    if (filterDirection !== 'all') {
      filtered = filtered.filter(s => {
        if (filterDirection === 'buy') return s.direction === 'SIGNAL_DIRECTION_BUY';
        if (filterDirection === 'sell') return s.direction === 'SIGNAL_DIRECTION_SELL';
        return true;
      });
    }
    
    return filtered.sort((a, b) => 
      new Date(b.createDt).getTime() - new Date(a.createDt).getTime()
    );
  }, [signals, filterDirection]);

  const tableData = useMemo(() => {
    return filteredSignals.map(signal => ({
      id: signal.signalId,
      direction: signal.direction === 'SIGNAL_DIRECTION_BUY' ? 'ПОКУПКА' : 
                 signal.direction === 'SIGNAL_DIRECTION_SELL' ? 'ПРОДАЖА' : 'НЕИЗВЕСТНО',
      strategy: signal.strategyName || signal.name,
      createDate: formatDate(signal.createDt),
      endDate: formatDate(signal.endDt),
      initialPrice: signal.initialPrice ? formatCurrency(signal.initialPrice) : 'N/A',
      targetPrice: signal.targetPrice ? formatCurrency(signal.targetPrice) : 'N/A',
      stopLoss: signal.stoploss ? formatCurrency(signal.stoploss) : 'N/A',
      probability: `${(signal.probability * 100).toFixed(1)}%`,
      status: signal.isActive ? 'Активен' : 'Завершен'
    }));
  }, [filteredSignals, formatDate, formatCurrency]);

  const columns = [
    { key: 'direction', header: 'Направление' },
    { key: 'strategy', header: 'Стратегия' },
    { key: 'createDate', header: 'Дата создания' },
    { key: 'endDate', header: 'Дата окончания' },
    { key: 'initialPrice', header: 'Цена входа' },
    { key: 'targetPrice', header: 'Целевая цена' },
    { key: 'stopLoss', header: 'Стоп-лосс' },
    { key: 'probability', header: 'Вероятность' },
    { key: 'status', header: 'Статус' }
  ];

  if (signals.length === 0) {
    return (
      <div className="all-signals-tab__empty">
        <p>Нет сигналов</p>
        <p className="all-signals-tab__empty-hint">
          Сигналы появятся здесь после их генерации
        </p>
      </div>
    );
  }

  return (
    <div className="all-signals-tab">
      <div className="all-signals-tab__controls">
        <div className="all-signals-tab__filters">
          <select 
            value={filterDirection}
            onChange={(e) => setFilterDirection(e.target.value)}
            className="all-signals-tab__filter-select"
          >
            <option value="all">Все направления</option>
            <option value="buy">Только покупка</option>
            <option value="sell">Только продажа</option>
          </select>
        </div>
        <div className="all-signals-tab__view-toggle">
          <button
            className={`all-signals-tab__view-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            Таблица
          </button>
          <button
            className={`all-signals-tab__view-btn ${viewMode === 'cards' ? 'active' : ''}`}
            onClick={() => setViewMode('cards')}
          >
            Карточки
          </button>
        </div>
      </div>

      {viewMode === 'table' ? (
        <div className="all-signals-tab__table">
          <DataTable
            data={tableData}
            columns={columns}
            paginator
            rows={25}
            sortMode="multiple"
            emptyMessage="Нет сигналов"
          />
        </div>
      ) : (
        <div className="all-signals-tab__cards">
          {filteredSignals.map(signal => (
            <SignalCard
              key={signal.signalId}
              signal={signal}
              formatDate={formatDate}
              formatCurrency={formatCurrency}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AllSignalsTab;

