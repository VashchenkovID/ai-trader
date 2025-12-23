import React from 'react';
import { Card, Button, Skeleton } from '../ui';
import SignalCard from './SignalCard';
import './SignalsList.css';

interface SignalItem {
  signalId: string;
  strategyId?: string;
  direction: string | 'SIGNAL_DIRECTION_BUY' | 'SIGNAL_DIRECTION_SELL' | 'SIGNAL_DIRECTION_UNSPECIFIED';
  strategyName: string;
  probability?: number;
  name?: string;
  createDt: string;
  endDt: string;
  initialPrice?: number | null;
  targetPrice?: number | null;
  stoploss?: number | null;
  info?: string;
  isActive: boolean;
}

interface SignalsListProps {
  signals: SignalItem[];
  loading?: boolean;
  loadingMore?: boolean;
  onRefresh: () => void;
  onShowMore: () => void;
  formatDate: (date: string) => string;
  formatCurrency: (price: number) => string;
  figi?: string;
}

export const SignalsList: React.FC<SignalsListProps> = ({
  signals,
  loading = false,
  loadingMore = false,
  onRefresh,
  onShowMore,
  formatDate,
  formatCurrency,
  figi,
}) => {
  const displaySignals = signals.slice(0, 5);
  const hasMore = signals.length > 5;

  return (
    <Card variant="default" className="mb-4 signals-list">
      <div className="signals-list-header">
        <h3 style={{ margin: 0 }}>⚡ Торговые сигналы</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          loading={loading}
          disabled={!figi || loading}
        >
          Запросить сигналы
        </Button>
      </div>
      
      {loading && signals.length === 0 ? (
        <div className="signals-list-skeleton">
          <Skeleton variant="rectangular" width="100%" height={120} className="mb-3" />
          <Skeleton variant="rectangular" width="100%" height={120} className="mb-3" />
          <Skeleton variant="rectangular" width="100%" height={120} />
        </div>
      ) : signals.length > 0 ? (
        <>
          <div className="signals-list-content">
            {displaySignals.map((signal) => (
              <SignalCard
                key={signal.signalId}
                signal={signal}
                formatDate={formatDate}
                formatCurrency={formatCurrency}
              />
            ))}
          </div>
          {hasMore && (
            <div className="signals-list-more">
              <Button
                variant="ghost"
                size="sm"
                onClick={onShowMore}
              >
                Еще
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="signals-list-empty">
          Нет сигналов
        </div>
      )}
    </Card>
  );
};

export default SignalsList;

