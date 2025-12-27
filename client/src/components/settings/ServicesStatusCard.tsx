import React from 'react';
import { Card } from '../ui/Card/Card';
import { Badge } from '../ui/Badge/Badge';
import { Button } from '../ui/Button/Button';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import './ServicesStatusCard.css';

interface ServicesStatus {
  [key: string]: {
    isInitialized: boolean;
    isActive?: boolean;
    status?: string;
  };
}

interface ServicesStatusCardProps {
  servicesStatus: ServicesStatus | null;
  serviceInitializing: Record<string, boolean>;
  onInitialize: (serviceName: string) => void;
}

const ServicesStatusCard: React.FC<ServicesStatusCardProps> = ({
  servicesStatus,
  serviceInitializing,
  onInitialize
}) => {
  if (!servicesStatus) {
    return (
      <Card variant="glass" header="🔧 Статус сервисов" className="services-status-card">
        <div className="services-status-skeleton">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="services-status-skeleton-item">
              <Skeleton variant="text" size="md" style={{ width: '60%', marginBottom: '0.5rem' }} />
              <Skeleton variant="text" size="sm" style={{ width: '40%' }} />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const serviceNames: { [key: string]: string } = {
    IntegratedAI: 'Интегрированный AI',
    Ensemble: 'Ансамбль моделей',
    MetaLearning: 'Meta Learning',
    ReinforcementLearning: 'Reinforcement Learning',
    NeuralNetwork: 'Нейросеть',
    TradingEngine: 'Торговый движок',
    PortfolioOptimizer: 'Оптимизатор портфеля',
    MacroDataService: 'Макроэкономические данные'
  };

  return (
    <Card variant="glass" header="🔧 Статус сервисов" className="services-status-card">
      <div className="services-status-content">
        {Object.entries(servicesStatus).map(([key, status]) => {
          const displayName = serviceNames[key] || key;
          const isInitialized = status.isInitialized;
          const isActive = status.isActive !== false;
          const isInitializing = serviceInitializing[key] || false;

          return (
            <div key={key} className="services-status-item">
              <div className="services-status-item-content">
                <div className="services-status-item-header">
                  <div className="services-status-item-name">{displayName}</div>
                  <Badge 
                    variant={isInitialized && isActive ? 'success' : isInitialized ? 'warning' : 'error'} 
                    size="sm"
                  >
                    {isInitialized && isActive ? 'Активен' : isInitialized ? 'Инициализирован' : 'Не инициализирован'}
                  </Badge>
                </div>
              </div>
              {!isInitialized && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onInitialize(key)}
                  loading={isInitializing}
                  disabled={isInitializing}
                  icon={<i className="pi pi-play"></i>}
                >
                  Инициализировать
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default ServicesStatusCard;

