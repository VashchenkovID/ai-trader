import React from 'react';
import { Card, Badge, InfoTooltip } from '../ui';
import HorizonCard from './HorizonCard';
import './HorizonCards.css';

interface Horizon {
  name: string;
  description: string;
  model?: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  score: number;
  confidence: number;
  explanation?: string;
  strategies?: {
    aggressive?: {
      recommendation: 'BUY' | 'SELL' | 'HOLD';
      explanation?: string;
      score?: number;
      confidence?: number;
    };
    moderate?: {
      recommendation: 'BUY' | 'SELL' | 'HOLD';
      explanation?: string;
      score?: number;
      confidence?: number;
    };
    conservative?: {
      recommendation: 'BUY' | 'SELL' | 'HOLD';
      explanation?: string;
      score?: number;
      confidence?: number;
    };
  };
}

interface Horizons {
  shortTerm?: Horizon;
  mediumTerm?: Horizon;
  longTerm?: Horizon;
}

interface HorizonCardsProps {
  horizons: Horizons;
  agreement?: number | null;
}

export const HorizonCards: React.FC<HorizonCardsProps> = ({ horizons, agreement }) => {
  const { shortTerm, mediumTerm, longTerm } = horizons;

  const getAgreementVariant = (agreement: number): 'success' | 'warning' | 'error' => {
    if (agreement >= 0.7) return 'success';
    if (agreement >= 0.5) return 'warning';
    return 'error';
  };

  const getAgreementText = (agreement: number): string => {
    if (agreement >= 0.7) return 'Высокая согласованность';
    if (agreement >= 0.5) return 'Умеренная согласованность';
    return 'Низкая согласованность';
  };

  return (
    <Card variant="glass" className="horizon-cards-container">
      <div className="horizon-cards-header">
        <h2 className="horizon-cards-title">
          📊 Прогнозы по горизонтам
          <InfoTooltip
            explanation="Прогнозы разбиты на три временных горизонта: краткосрочный (1-3 дня), среднесрочный (1-4 недели) и долгосрочный (2-3 месяца). Каждый горизонт использует свою модель AI для более точного прогноза."
            title="Что такое горизонты прогноза?"
            variant="info"
          />
        </h2>
        {agreement !== undefined && agreement !== null && (
          <div className="horizon-cards-agreement">
            <Badge variant={getAgreementVariant(agreement)} size="md">
              {getAgreementText(agreement)}
            </Badge>
            <span className="horizon-cards-agreement-value">
              {Math.round(agreement * 100)}%
            </span>
            <InfoTooltip
              explanation="Согласованность показывает, насколько согласны между собой прогнозы разных горизонтов. Высокая согласованность (70%+) означает, что все модели предсказывают похожий результат, что повышает надежность прогноза."
              title="Согласованность горизонтов"
              variant="info"
            />
          </div>
        )}
      </div>

      <div className="horizon-cards-grid">
        {shortTerm && (
          <HorizonCard horizon={shortTerm} type="shortTerm" />
        )}
        {mediumTerm && (
          <HorizonCard horizon={mediumTerm} type="mediumTerm" />
        )}
        {longTerm && (
          <HorizonCard horizon={longTerm} type="longTerm" />
        )}
      </div>

      {!shortTerm && !mediumTerm && !longTerm && (
        <div className="horizon-cards-empty">
          <p>Нет данных по горизонтам прогноза</p>
        </div>
      )}
    </Card>
  );
};

export default HorizonCards;

