import React, { useState } from 'react';
import { Card, Button, Badge, Modal } from '../ui';
import NewsCard from './NewsCard';
import './RecentNewsWidget.css';

interface NewsItem {
  title: string;
  description?: string;
  url?: string;
  publishedAt: string;
  source?: {
    name: string;
  };
  sentiment?: 'positive' | 'negative' | 'neutral';
  relevance?: number;
}

interface RecentNewsWidgetProps {
  news: NewsItem[];
  maxVisible?: number;
  onViewAll?: () => void;
}

const RecentNewsWidget: React.FC<RecentNewsWidgetProps> = ({
  news,
  maxVisible = 5,
  onViewAll
}) => {
  const [showAllModal, setShowAllModal] = useState(false);

  // Сортируем новости по дате (новые первыми) и ограничиваем количество
  const recentNews = news
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, maxVisible);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleViewAll = () => {
    if (onViewAll) {
      onViewAll();
    } else {
      setShowAllModal(true);
    }
  };

  const getSentimentIcon = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive':
        return '📈';
      case 'negative':
        return '📉';
      case 'neutral':
        return '➡️';
      default:
        return '📰';
    }
  };

  const getSentimentColor = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive':
        return 'success';
      case 'negative':
        return 'error';
      case 'neutral':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  if (recentNews.length === 0) {
    return (
      <Card className="recent-news-widget">
        <div className="recent-news-widget__header">
          <h3 className="recent-news-widget__title">Последние новости</h3>
        </div>
        <div className="recent-news-widget__empty">
          Нет новостей
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="recent-news-widget">
        <div className="recent-news-widget__header">
          <h3 className="recent-news-widget__title">Последние новости</h3>
          {news.length > maxVisible && (
            <Badge variant="neutral" className="recent-news-widget__count">
              {news.length}
            </Badge>
          )}
        </div>
        
        <div className="recent-news-widget__content">
          {recentNews.map((item, index) => (
            <div key={index} className="recent-news-widget__item">
              <div className="recent-news-widget__item-header">
                <div className="recent-news-widget__item-sentiment">
                  <span className="recent-news-widget__item-sentiment-icon">
                    {getSentimentIcon(item.sentiment)}
                  </span>
                  {item.sentiment && (
                    <Badge 
                      variant={getSentimentColor(item.sentiment)}
                      className="recent-news-widget__item-sentiment-badge"
                    >
                      {item.sentiment === 'positive' ? 'Позитивно' : 
                       item.sentiment === 'negative' ? 'Негативно' : 'Нейтрально'}
                    </Badge>
                  )}
                </div>
                <span className="recent-news-widget__item-date">
                  {new Date(item.publishedAt).toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              
              <div className="recent-news-widget__item-body">
                <h4 className="recent-news-widget__item-title">
                  {item.title}
                </h4>
                
                {item.description && (
                  <p className="recent-news-widget__item-description">
                    {item.description.length > 100 
                      ? `${item.description.substring(0, 100)}...` 
                      : item.description}
                  </p>
                )}
                
                <div className="recent-news-widget__item-footer">
                  {item.source?.name && (
                    <span className="recent-news-widget__item-source">
                      {item.source.name}
                    </span>
                  )}
                  {item.relevance !== undefined && (
                    <span className="recent-news-widget__item-relevance">
                      Релевантность: {(item.relevance * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {news.length > maxVisible && (
          <div className="recent-news-widget__footer">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleViewAll}
              className="recent-news-widget__view-all-btn"
            >
              Все новости ({news.length})
            </Button>
          </div>
        )}
      </Card>

      {/* Модальное окно со всеми новостями */}
      <Modal
        isOpen={showAllModal}
        onClose={() => setShowAllModal(false)}
        title="Все новости"
        size="xl"
      >
        <div className="recent-news-widget__modal-content">
          {news.map((item, index) => (
            <NewsCard key={index} news={item} formatDate={formatDate} />
          ))}
        </div>
      </Modal>
    </>
  );
};

export default RecentNewsWidget;

