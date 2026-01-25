import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../ui/Card/Card.tsx';
import { Skeleton } from '../../ui/Skeleton/Skeleton.tsx';
import { Button } from '../../ui/Button/Button.tsx';
import { Badge } from '../../ui/Badge/Badge.tsx';
import { apiService } from '../../../services/apiService.ts';
import { translateRecommendation } from '../../../utils/recommendationTranslator.ts';
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
        <div className="skeleton-list">
          {[1, 2, 3].map((item) => (
            <div key={item} className="skeleton-item">
              <Skeleton variant="rectangular" size="md" className="skeleton-content" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="error-container">
          <div className="error-message">{error}</div>
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
        <div className="empty-container">
          <div className="empty-message">Нет данных о сделках</div>
        </div>
      ) : (
        <div className="trades-list">
          {trades.map((trade, index) => {
            const isBuy = trade.action === 'BUY';
            const ticker = trade.ticker || trade.figi?.substring(0, 8) || 'N/A';
            const profit = trade.profit;
            const hasProfit = profit !== undefined && profit !== null;
            const isProfitable = hasProfit && profit > 0;

            return (
              <div
                key={trade.id || index}
                className="recent-trade-item"
                style={{ cursor: trade.figi ? 'pointer' : 'default' }}
                onClick={() => trade.figi && navigate(`/stock/${trade.figi}`)}
              >
                <div className="trade-header">
                  <div className="trade-info">
                    <Badge variant={isBuy ? 'success' : 'error'} size="sm">
                      {translateRecommendation(trade.action || 'BUY')}
                    </Badge>
                    <span className="trade-ticker">{ticker}</span>
                    {trade.name && (
                      <span className="trade-name">
                        {trade.name}
                      </span>
                    )}
                  </div>
                  {hasProfit && profit !== undefined && (
                    <div className={`trade-profit ${isProfitable ? 'number-success' : 'number-error'}`}>
                      {isProfitable ? '+' : ''}{formatCurrency(profit)}
                      {trade.profitPercent !== undefined && (
                        <span style={{ marginLeft: '0.25rem' }}>
                          ({isProfitable ? '+' : ''}{trade.profitPercent.toFixed(2)}%)
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="trade-footer">
                  <div className="trade-details">
                    {trade.quantity && `${trade.quantity} шт.`} {trade.price && `× ${formatCurrency(trade.price)}`}
                  </div>
                  <div className="trade-details">
                    {formatDateTime(trade.executedAt || trade.timestamp || trade.createdAt)}
                  </div>
                </div>
                {trade.totalAmount && (
                  <div className="trade-total">
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

