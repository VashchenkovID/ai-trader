import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Badge } from '../ui';
import './StockDetailHeader.css';

interface StockDetailHeaderProps {
  ticker: string;
  name: string;
  sector?: string;
  currentPrice: number;
  priceChange?: number;
  priceChangePercent?: number;
  currency: string;
  onAnalyze?: () => void;
  onTrain?: () => void;
  onBuy?: () => void;
  onWatchlist?: () => void;
  isInWatchlist?: boolean;
}

const StockDetailHeader: React.FC<StockDetailHeaderProps> = ({
  ticker,
  name,
  sector,
  currentPrice,
  priceChange = 0,
  priceChangePercent = 0,
  currency,
  onAnalyze,
  onTrain,
  onBuy,
  onWatchlist,
  isInWatchlist = false
}) => {
  const navigate = useNavigate();
  const isPositive = priceChange >= 0;

  return (
    <header className="stock-detail-header">
      <div className="stock-detail-header__content">
        {/* Левая часть: Навигация и основная информация */}
        <div className="stock-detail-header__left">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="stock-detail-header__back-btn"
            aria-label="Назад"
          >
            ← Назад
          </Button>
          
          <div className="stock-detail-header__info">
            <div className="stock-detail-header__ticker-row">
              <h1 className="stock-detail-header__ticker">{ticker}</h1>
              {sector && (
                <Badge variant="neutral" className="stock-detail-header__sector">
                  {sector}
                </Badge>
              )}
            </div>
            <p className="stock-detail-header__name">{name}</p>
          </div>
        </div>

        {/* Центральная часть: Цена и изменение */}
        <div className="stock-detail-header__center">
          <div className="stock-detail-header__price-group">
            <span className="stock-detail-header__price">
              {currentPrice.toLocaleString('ru-RU', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })} {currency}
            </span>
            {(priceChange !== 0 || priceChangePercent !== 0) && (
              <div className={`stock-detail-header__change ${isPositive ? 'positive' : 'negative'}`}>
                <span className="stock-detail-header__change-arrow">
                  {isPositive ? '↑' : '↓'}
                </span>
                <span className="stock-detail-header__change-amount">
                  {Math.abs(priceChange).toLocaleString('ru-RU', { 
                    minimumFractionDigits: 2, 
                    maximumFractionDigits: 2 
                  })} {currency}
                </span>
                <span className="stock-detail-header__change-percent">
                  ({isPositive ? '+' : ''}{priceChangePercent.toFixed(2)}%)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Правая часть: Быстрые действия */}
        <div className="stock-detail-header__actions">
          {onAnalyze && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onAnalyze}
              className="stock-detail-header__action-btn"
            >
              Анализ
            </Button>
          )}
          {onTrain && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onTrain}
              className="stock-detail-header__action-btn"
            >
              Обучение
            </Button>
          )}
          {onBuy && (
            <Button
              variant="default"
              size="sm"
              onClick={onBuy}
              className="stock-detail-header__action-btn stock-detail-header__action-btn--primary"
            >
              Купить
            </Button>
          )}
          {onWatchlist && (
            <Button
              variant={isInWatchlist ? "default" : "ghost"}
              size="sm"
              onClick={onWatchlist}
              className="stock-detail-header__action-btn"
              aria-label={isInWatchlist ? "Удалить из избранного" : "Добавить в избранное"}
            >
              {isInWatchlist ? '★' : '☆'}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};

export default StockDetailHeader;

