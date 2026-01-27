import React from 'react';
import { Card, Button, Skeleton } from '../ui';
import NewsCard from './NewsCard';
import './NewsList.css';

interface NewsItem {
  title: string;
  description?: string;
  url?: string;
  publishedAt: string;
  source?: {
    name?: string;
  };
}

interface NewsListProps {
  news: NewsItem[];
  loading?: boolean;
  loadingMore?: boolean;
  onRefresh: () => void;
  onShowMore: () => void;
  formatDate: (date: string) => string;
  figi?: string;
  ticker?: string;
}

export const NewsList: React.FC<NewsListProps> = ({
  news,
  loading = false,
  // loadingMore = false, // Reserved for future use
  onRefresh,
  onShowMore,
  formatDate,
  figi,
  ticker,
}) => {
  const displayNews = news.slice(0, 5);
  const hasMore = news.length > 5;

  return (
    <Card variant="default" className="mb-4 news-list">
      <div className="news-list-header">
        <h3 style={{ margin: 0 }}>📰 Новости</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          loading={loading}
          disabled={!figi || !ticker || loading}
          title="Загрузить свежие новости из NewsAPI и сохранить в БД"
        >
          Загрузить свежие
        </Button>
      </div>
      
      {loading && news.length === 0 ? (
        <div className="news-list-skeleton">
          <Skeleton variant="rectangular" width="100%" height={100} className="mb-3" />
          <Skeleton variant="rectangular" width="100%" height={100} className="mb-3" />
          <Skeleton variant="rectangular" width="100%" height={100} />
        </div>
      ) : news.length > 0 ? (
        <>
          <div className="news-list-content">
            {displayNews.map((item, index) => (
              <NewsCard
                key={index}
                news={item}
                formatDate={formatDate}
              />
            ))}
          </div>
          {hasMore && (
            <div className="news-list-more">
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
        <div className="news-list-empty">
          Нет новостей
        </div>
      )}
    </Card>
  );
};

export default NewsList;

