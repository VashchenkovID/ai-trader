import React from 'react';
import { Skeleton, Card } from '../ui';
import './StockDetailSkeleton.css';

export const StockDetailSkeleton: React.FC = () => {
  return (
    <div className="stock-detail-skeleton">
      {/* Кнопка назад */}
      <div style={{ marginBottom: '24px' }}>
        <Skeleton variant="rectangular" width={100} height={38} />
      </div>

      {/* Hero секция */}
      <Card variant="default" className="mb-4">
        <div className="skeleton-hero">
          <Skeleton variant="text" width="60%" height={32} className="mb-3" />
          <div className="skeleton-hero-main">
            <div className="skeleton-hero-left">
              <Skeleton variant="text" width="40%" height={24} className="mb-2" />
              <Skeleton variant="text" width="50%" height={40} className="mb-3" />
              <Skeleton variant="rectangular" width="100%" height={80} className="mb-3" />
            </div>
            <div className="skeleton-hero-right">
              <Skeleton variant="rectangular" width="100%" height={120} />
            </div>
          </div>
          <div className="skeleton-hero-actions">
            <Skeleton variant="rectangular" width="100%" height={38} />
            <Skeleton variant="rectangular" width="100%" height={38} />
            <Skeleton variant="rectangular" width="100%" height={38} />
          </div>
        </div>
      </Card>

      {/* Прогнозы по горизонтам */}
      <Card variant="glass" className="mb-4">
        <Skeleton variant="text" width="40%" height={24} className="mb-4" />
        <div className="skeleton-horizons">
          <Skeleton variant="rectangular" width="100%" height={300} className="mb-3" />
          <Skeleton variant="rectangular" width="100%" height={300} className="mb-3" />
          <Skeleton variant="rectangular" width="100%" height={300} />
        </div>
      </Card>

      {/* Основной контент */}
      <div className="grid">
        {/* Левая колонка - Графики */}
        <div className="col-12 lg:col-8">
          {/* График цены */}
          <Card variant="default" className="mb-4">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <Skeleton variant="text" width={150} height={24} />
              <Skeleton variant="rectangular" width={200} height={32} />
            </div>
            <Skeleton variant="rectangular" width="100%" height={400} />
          </Card>

          {/* График объема */}
          <Card variant="default" className="mb-4">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <Skeleton variant="text" width={150} height={24} />
              <Skeleton variant="rectangular" width={200} height={32} />
            </div>
            <Skeleton variant="rectangular" width="100%" height={300} />
          </Card>
        </div>

        {/* Правая колонка - Сигналы и Новости */}
        <div className="col-12 lg:col-4">
          {/* Сигналы */}
          <Card variant="default" className="mb-4">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <Skeleton variant="text" width={150} height={24} />
              <Skeleton variant="rectangular" width={140} height={32} />
            </div>
            <div className="skeleton-signals">
              <Skeleton variant="rectangular" width="100%" height={120} className="mb-3" />
              <Skeleton variant="rectangular" width="100%" height={120} className="mb-3" />
              <Skeleton variant="rectangular" width="100%" height={120} />
            </div>
          </Card>

          {/* Новости */}
          <Card variant="default" className="mb-4">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <Skeleton variant="text" width={100} height={24} />
              <Skeleton variant="rectangular" width={140} height={32} />
            </div>
            <div className="skeleton-news">
              <Skeleton variant="rectangular" width="100%" height={100} className="mb-3" />
              <Skeleton variant="rectangular" width="100%" height={100} className="mb-3" />
              <Skeleton variant="rectangular" width="100%" height={100} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default StockDetailSkeleton;

