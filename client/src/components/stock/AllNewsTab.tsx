import React, { useState, useMemo } from 'react';
import { DataTable } from '../ui';
import NewsCard from './NewsCard';
import './AllNewsTab.css';

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

interface AllNewsTabProps {
  figi: string;
  ticker: string;
  news: NewsItem[];
  onRefresh?: () => void;
  isLoading?: boolean;
}

const AllNewsTab: React.FC<AllNewsTabProps> = ({
  figi,
  ticker,
  news,
  onRefresh,
  isLoading = false
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [filterSentiment, setFilterSentiment] = useState<string>('all');

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredNews = useMemo(() => {
    let filtered = news;
    
    if (filterSentiment !== 'all') {
      filtered = filtered.filter(item => item.sentiment === filterSentiment);
    }
    
    return filtered.sort((a, b) => 
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  }, [news, filterSentiment]);

  const tableData = useMemo(() => {
    return filteredNews.map((item, index) => ({
      id: index,
      title: item.title,
      source: item.source?.name || 'Неизвестно',
      publishedAt: formatDate(item.publishedAt),
      sentiment: item.sentiment === 'positive' ? 'Позитивно' :
                 item.sentiment === 'negative' ? 'Негативно' : 'Нейтрально',
      relevance: item.relevance ? `${(item.relevance * 100).toFixed(0)}%` : 'N/A',
      url: item.url || ''
    }));
  }, [filteredNews, formatDate]);

  const columns = [
    { key: 'title', header: 'Заголовок' },
    { key: 'source', header: 'Источник' },
    { key: 'publishedAt', header: 'Дата публикации' },
    { key: 'sentiment', header: 'Sentiment' },
    { key: 'relevance', header: 'Релевантность' }
  ];

  if (news.length === 0) {
    return (
      <div className="all-news-tab__empty">
        <p>Нет новостей</p>
        <p className="all-news-tab__empty-hint">
          Новости появятся здесь после их загрузки
        </p>
      </div>
    );
  }

  return (
    <div className="all-news-tab">
      <div className="all-news-tab__controls">
        <div className="all-news-tab__filters">
          <select 
            value={filterSentiment}
            onChange={(e) => setFilterSentiment(e.target.value)}
            className="all-news-tab__filter-select"
          >
            <option value="all">Все sentiment</option>
            <option value="positive">Позитивные</option>
            <option value="negative">Негативные</option>
            <option value="neutral">Нейтральные</option>
          </select>
        </div>
        <div className="all-news-tab__controls-right">
          {onRefresh && (
            <button
              className="all-news-tab__refresh-btn"
              onClick={onRefresh}
              disabled={isLoading || !figi || !ticker}
              title="Загрузить свежие новости из NewsAPI и сохранить в БД"
            >
              {isLoading ? '⏳ Обновление...' : '🔄 Обновить новости'}
            </button>
          )}
          <div className="all-news-tab__view-toggle">
            <button
              className={`all-news-tab__view-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              Таблица
            </button>
            <button
              className={`all-news-tab__view-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
            >
              Карточки
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'table' ? (
        <div className="all-news-tab__table">
          <DataTable
            data={tableData}
            columns={columns}
            paginator
            rows={25}
            sortMode="multiple"
            emptyMessage="Нет новостей"
          />
        </div>
      ) : (
        <div className="all-news-tab__cards">
          {filteredNews.map((item, index) => (
            <NewsCard
              key={index}
              news={item}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AllNewsTab;

