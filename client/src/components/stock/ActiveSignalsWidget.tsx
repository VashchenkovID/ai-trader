import React, { useState } from 'react';
import { Card, Button, Badge } from '../ui';
import { Modal } from '../ui';
import SignalCard from './SignalCard';
import './ActiveSignalsWidget.css';

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

interface ActiveSignalsWidgetProps {
  signals: SignalItem[];
  maxVisible?: number;
  onViewAll?: () => void;
}

const ActiveSignalsWidget: React.FC<ActiveSignalsWidgetProps> = ({
  signals,
  maxVisible = 5,
  onViewAll
}) => {
  const [showAllModal, setShowAllModal] = useState(false);

  // Фильтруем активные сигналы и сортируем по дате создания (новые первыми)
  const activeSignals = signals
    .filter(s => s.isActive)
    .sort((a, b) => new Date(b.createDt).getTime() - new Date(a.createDt).getTime())
    .slice(0, maxVisible);

  const allActiveSignals = signals
    .filter(s => s.isActive)
    .sort((a, b) => new Date(b.createDt).getTime() - new Date(a.createDt).getTime());

  const handleViewAll = () => {
    if (onViewAll) {
      onViewAll();
    } else {
      setShowAllModal(true);
    }
  };

  const getDirectionLabel = (direction: string) => {
    switch (direction) {
      case 'SIGNAL_DIRECTION_BUY':
        return 'ПОКУПКА';
      case 'SIGNAL_DIRECTION_SELL':
        return 'ПРОДАЖА';
      default:
        return 'НЕИЗВЕСТНО';
    }
  };

  const getDirectionColor = (direction: string) => {
    switch (direction) {
      case 'SIGNAL_DIRECTION_BUY':
        return 'success';
      case 'SIGNAL_DIRECTION_SELL':
        return 'error';
      default:
        return 'neutral';
    }
  };

  if (activeSignals.length === 0) {
    return (
      <Card variant="default" className="active-signals-widget">
        <div className="active-signals-widget__header">
          <h3 className="active-signals-widget__title">Активные сигналы</h3>
        </div>
        <div className="active-signals-widget__empty">
          Нет активных сигналов
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card variant="default" className="active-signals-widget">
        <div className="active-signals-widget__header">
          <h3 className="active-signals-widget__title">Активные сигналы</h3>
          {allActiveSignals.length > maxVisible && (
            <Badge variant="neutral" className="active-signals-widget__count">
              {allActiveSignals.length}
            </Badge>
          )}
        </div>
        
        <div className="active-signals-widget__content">
          {activeSignals.map((signal) => (
            <div key={signal.signalId} className="active-signals-widget__item">
              <div className="active-signals-widget__item-header">
                <Badge 
                  variant={getDirectionColor(signal.direction)}
                  className="active-signals-widget__item-badge"
                >
                  {getDirectionLabel(signal.direction)}
                </Badge>
                <span className="active-signals-widget__item-time">
                  {new Date(signal.createDt).toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              
              <div className="active-signals-widget__item-body">
                <div className="active-signals-widget__item-strategy">
                  {signal.strategyName || signal.name}
                </div>
                
                {signal.initialPrice && (
                  <div className="active-signals-widget__item-price">
                    Вход: {signal.initialPrice.toLocaleString('ru-RU', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </div>
                )}
                
                <div className="active-signals-widget__item-meta">
                  {signal.targetPrice && (
                    <span className="active-signals-widget__item-meta-item">
                      Цель: {signal.targetPrice.toLocaleString('ru-RU', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </span>
                  )}
                  {signal.stoploss && (
                    <span className="active-signals-widget__item-meta-item">
                      Стоп: {signal.stoploss.toLocaleString('ru-RU', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </span>
                  )}
                </div>
                
                <div className="active-signals-widget__item-confidence">
                  <span className="active-signals-widget__item-confidence-label">Уверенность:</span>
                  <span className="active-signals-widget__item-confidence-value">
                    {(signal.probability != null && !isNaN(signal.probability) ? signal.probability : 0).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {allActiveSignals.length > maxVisible && (
          <div className="active-signals-widget__footer">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleViewAll}
              className="active-signals-widget__view-all-btn"
            >
              Все сигналы ({allActiveSignals.length})
            </Button>
          </div>
        )}
      </Card>

      {/* Модальное окно со всеми сигналами */}
      <Modal
        isOpen={showAllModal}
        onClose={() => setShowAllModal(false)}
        title="Все активные сигналы"
        size="xl"
      >
        <div className="active-signals-widget__modal-content">
          {allActiveSignals.map((signal) => {
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
            return (
              <SignalCard 
                key={signal.signalId} 
                signal={signal}
                formatDate={formatDate}
                formatCurrency={formatCurrency}
              />
            );
          })}
        </div>
      </Modal>
    </>
  );
};

export default ActiveSignalsWidget;

