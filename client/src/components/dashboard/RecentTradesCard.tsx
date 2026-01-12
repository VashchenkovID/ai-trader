import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../ui/Card/Card';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { Button } from '../ui/Button/Button';
import { Badge } from '../ui/Badge/Badge';
import { apiService } from '../../services/apiService';
import { translateRecommendation } from '../../utils/recommendationTranslator';
import './RecentTradesCard.css';

interface Trade {
  id?: string;
  figi?: string;
  ticker?: string;
  name?: string;
  action?: 'BUY' | 'SELL';
  quantity?: number;
  price?: number;
  totalAmount?: number;
  timestamp?: string;
  executedAt?: string;
  createdAt?: string;
  status?: string;
  profit?: number;
  profitPercent?: number;
}

interface RecentTradesCardProps {
  className?: string;
  maxTrades?: number;
}

export const RecentTradesCard: React.FC<RecentTradesCardProps> = ({ 
  className = '',
  maxTrades = 5
}) => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadTrades = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const tradesData = await apiService.getTradingTrades();
      
      if (Array.isArray(tradesData)) {
        // Сортируем по дате (новые первыми) и берем последние N
        const sortedTrades = tradesData
          .sort((a, b) => {
            const dateA = new Date(a.executedAt || a.timestamp || a.createdAt || 0).getTime();
            const dateB = new Date(b.executedAt || b.timestamp || b.createdAt || 0).getTime();
            return dateB - dateA;
          })
          .slice(0, maxTrades);
        setTrades(sortedTrades);
      } else {
        setTrades([]);
      }
    } catch (err: any) {
      console.error('Error loading recent trades:', err);
      setError(err.message || 'Ошибка загрузки сделок');
      setTrades([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrades();
    // Обновляем каждые 30 секунд
    const interval = setInterval(loadTrades, 30000);
    return () => clearInterval(interval);
  }, [maxTrades]);

  const formatCurrency = (value: number | undefined) => {
    if (value === undefined || value === null) return '—';
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatDateTime = (dateString: string | undefined) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Только что';
    if (diffMins < 60) return `${diffMins} мин назад`;
    if (diffHours < 24) return `${diffHours} ч назад`;
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Card 
      variant="glass" 
      header={<span>Последние сделки</span>} 
      className={`h-full recent-trades-card ${className}`}
    >
      {loading && trades.length === 0 ? (
        <div className="flex flex-column gap-2">
          {[1, 2, 3].map((item) => (
            <div key={item} className="p-2 border-round" style={{ background: 'var(--color-surface-hover)' }}>
              <Skeleton variant="rectangular" size="md" style={{ width: '100%', height: '3rem' }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center p-3">
          <div className="text-xs text-500 mb-2">{error}</div>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadTrades}
            icon={<i className="pi pi-refresh"></i>}
          >
            Повторить
          </Button>
        </div>
      ) : trades.length === 0 ? (
        <div className="text-center p-3">
          <div className="text-xs text-500">Нет данных о сделках</div>
        </div>
      ) : (
        <div className="flex flex-column gap-2">
          {trades.map((trade, index) => {
            const isBuy = trade.action === 'BUY';
            const ticker = trade.ticker || trade.figi?.substring(0, 8) || 'N/A';
            const profit = trade.profit;
            const hasProfit = profit !== undefined && profit !== null;
            const isProfitable = hasProfit && profit > 0;

            return (
              <div
                key={trade.id || index}
                className="recent-trade-item p-2 border-round"
                style={{ 
                  background: 'var(--color-surface-hover)', 
                  border: '1px solid var(--color-border-default)',
                  cursor: trade.figi ? 'pointer' : 'default'
                }}
                onClick={() => trade.figi && navigate(`/stock/${trade.figi}`)}
              >
                <div className="flex align-items-center justify-content-between mb-1">
                  <div className="flex align-items-center gap-2">
                    <Badge variant={isBuy ? 'success' : 'error'} size="sm">
                      {translateRecommendation(trade.action || 'BUY')}
                    </Badge>
                    <span className="font-medium text-sm">{ticker}</span>
                    {trade.name && (
                      <span className="text-xs text-500" style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {trade.name}
                      </span>
                    )}
                  </div>
                  {hasProfit && profit !== undefined && (
                    <div className={`text-xs font-semibold ${isProfitable ? 'number-success' : 'number-error'}`}>
                      {isProfitable ? '+' : ''}{formatCurrency(profit)}
                      {trade.profitPercent !== undefined && (
                        <span className="ml-1">
                          ({isProfitable ? '+' : ''}{trade.profitPercent.toFixed(2)}%)
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex align-items-center justify-content-between">
                  <div className="text-xs text-500">
                    {trade.quantity && `${trade.quantity} шт.`} {trade.price && `× ${formatCurrency(trade.price)}`}
                  </div>
                  <div className="text-xs text-500">
                    {formatDateTime(trade.executedAt || trade.timestamp || trade.createdAt)}
                  </div>
                </div>
                {trade.totalAmount && (
                  <div className="text-xs text-500 mt-1">
                    Сумма: {formatCurrency(trade.totalAmount)}
                  </div>
                )}
              </div>
            );
          })}
          
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            icon={<i className="pi pi-arrow-right"></i>}
            iconPosition="right"
            onClick={() => navigate('/portfolio')}
            className="mt-1"
          >
            Все сделки
          </Button>
        </div>
      )}
    </Card>
  );
};

export default RecentTradesCard;

