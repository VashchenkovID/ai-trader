import React from 'react';
import './NewsCard.css';

interface NewsItem {
  title: string;
  description?: string;
  url?: string;
  publishedAt: string;
  source?: {
    name?: string;
  };
}

interface NewsCardProps {
  news: NewsItem;
  formatDate: (date: string) => string;
}

export const NewsCard: React.FC<NewsCardProps> = ({
  news,
  formatDate,
}) => {
  return (
    <div className="news-card">
      <div className="news-card-meta">
        {formatDate(news.publishedAt)}
        {news.source?.name && ` • ${news.source.name}`}
      </div>
      <div className="news-card-title">{news.title}</div>
      {news.description && (
        <div className="news-card-description">{news.description}</div>
      )}
      {news.url && (
        <a 
          href={news.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="news-card-link"
        >
          Читать далее →
        </a>
      )}
    </div>
  );
};

export default NewsCard;

