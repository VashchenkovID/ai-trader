import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Badge } from '../ui';
import BuyButton from '../recommendations/BuyButton';
import AnalyzeButton from '../recommendations/AnalyzeButton';
import TrainButton from '../recommendations/TrainButton';
import './StockDetailHeader.css';

interface StockDetailHeaderProps {
  ticker: string;
  name: string;
  sector?: string;
  currentPrice: number;
  priceChange?: number;
  priceChangePercent?: number;
  currency: string;
  figi?: string;
  stopLoss?: number;
  takeProfit?: number;
  lastUpdateTime?: string;
  isLive?: boolean;
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
  figi,
  stopLoss,
  takeProfit,
  lastUpdateTime,
  isLive = false,
  onAnalyze,
  onTrain,
  onBuy,
  onWatchlist,
  isInWatchlist = false
}) => {
  const navigate = useNavigate();
  const isPositive = priceChange >= 0;

  // Вычисляем расстояния для стоп-лосса и тейк-профита
  const stopLossDistance = stopLoss && typeof stopLoss === 'number' && !isNaN(stopLoss) 
    ? currentPrice - stopLoss 
    : null;
  const stopLossDistancePercent = stopLossDistance !== null && currentPrice !== 0 
    ? (stopLossDistance / currentPrice) * 100 
    : null;
  
  const takeProfitDistance = takeProfit && typeof takeProfit === 'number' && !isNaN(takeProfit)
    ? takeProfit - currentPrice 
    : null;
  const takeProfitDistancePercent = takeProfitDistance !== null && currentPrice !== 0 
    ? (takeProfitDistance / currentPrice) * 100 
    : null;

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

        {/* Центральная часть: Цена, изменение, стоп-лосс и тейк-профит */}
        <div className="stock-detail-header__center">
          <div className="stock-detail-header__price-group">
            <div className="stock-detail-header__price-row">
              <div className="stock-detail-header__price-section">
                <div className="stock-detail-header__price-label">Текущая цена</div>
                <div className="stock-detail-header__price-wrapper">
                  <span className="stock-detail-header__price">
                    {currentPrice.toLocaleString('ru-RU', { 
                      minimumFractionDigits: 2, 
                      maximumFractionDigits: 2 
                    })} {currency}
                  </span>
                  {isLive && (
                    <span className="stock-detail-header__live-indicator" title="Live обновления">
                      <span className="stock-detail-header__live-dot"></span>
                      Live
                    </span>
                  )}
                </div>
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
                      ({isPositive ? '+' : ''}{(priceChangePercent ?? 0).toFixed(2)}%)
                    </span>
                  </div>
                )}
                {lastUpdateTime && (
                  <div className="stock-detail-header__update-time">
                    Обновлено: {new Date(lastUpdateTime).toLocaleTimeString('ru-RU')}
                  </div>
                )}
              </div>

              {(stopLoss !== undefined && stopLoss !== null && typeof stopLoss === 'number' && !isNaN(stopLoss) && stopLoss > 0) && (
                <div className="stock-detail-header__stop-loss-section">
                  <div className="stock-detail-header__stop-loss-label">
                    <span className="stock-detail-header__stop-loss-icon">⚠️</span>
                    Стоп-лосс
                  </div>
                  <div className="stock-detail-header__stop-loss-value">
                    {stopLoss.toLocaleString('ru-RU', { 
                      minimumFractionDigits: 2, 
                      maximumFractionDigits: 2 
                    })} {currency}
                  </div>
                  {stopLossDistancePercent !== null && (
                    <div className="stock-detail-header__stop-loss-distance">
                      -{Math.abs(stopLossDistancePercent).toFixed(2)}%
                    </div>
                  )}
                </div>
              )}

              {(takeProfit !== undefined && takeProfit !== null && typeof takeProfit === 'number' && !isNaN(takeProfit) && takeProfit > 0) && (
                <div className="stock-detail-header__take-profit-section">
                  <div className="stock-detail-header__take-profit-label">
                    <span className="stock-detail-header__take-profit-icon">✅</span>
                    Тейк-профит
                  </div>
                  <div className="stock-detail-header__take-profit-value">
                    {takeProfit.toLocaleString('ru-RU', { 
                      minimumFractionDigits: 2, 
                      maximumFractionDigits: 2 
                    })} {currency}
                  </div>
                  {takeProfitDistancePercent !== null && (
                    <div className="stock-detail-header__take-profit-distance">
                      +{takeProfitDistancePercent.toFixed(2)}%
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Правая часть: Быстрые действия */}
        <div className="stock-detail-header__actions">
          {ticker && name && (
            <>
              <div className="stock-detail-header__action-wrapper">
                <AnalyzeButton
                  rowData={{
                    figi: figi || '',
                    ticker,
                    name
                  }}
                  onAnalysisComplete={() => {
                    // Callback будет обработан в родительском компоненте
                    if (onAnalyze) onAnalyze();
                  }}
                />
              </div>
              <div className="stock-detail-header__action-wrapper">
                <TrainButton
                  rowData={{
                    figi: figi || '',
                    ticker,
                    name
                  }}
                  onTrainingComplete={() => {
                    if (onTrain) onTrain();
                  }}
                />
              </div>
              {currentPrice && (
                <div className="stock-detail-header__action-wrapper">
                  <BuyButton
                    rowData={{
                      figi: figi || '',
                      ticker,
                      name,
                      recommendation: 'BUY' as const,
                      confidence: 0,
                      score: 0,
                      priceAtAnalysis: currentPrice,
                      currentPrice,
                      analysisDate: new Date().toISOString()
                    }}
                    onRequestCreated={() => {
                      if (onBuy) onBuy();
                    }}
                  />
                </div>
              )}
            </>
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

