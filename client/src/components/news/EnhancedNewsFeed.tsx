import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '../ui/Card/Card';
import { Badge } from '../ui/Badge/Badge';
import { Button } from '../ui/Button/Button';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import { Select } from '../ui/Select/Select';
import { apiService } from '../../services/apiService';
import './EnhancedNewsFeed.css';

export type NewsCategory = 'earnings' | 'mergers' | 'macro' | 'dividends' | 'guidance' | 'regulatory' | 'other';

export type NewsPriority = 'critical' | 'high' | 'medium' | 'low';

export interface EnhancedNewsItem {
  id?: string;
  title: string;
  description?: string;
  url?: string;
  publishedAt: string;
  source?: {
    name?: string;
  };
  category?: NewsCategory;
  priority?: NewsPriority;
  importance?: number; // 0-1
  timeDecay?: number; // 0-1, влияние временного затухания
  impactOnPrice?: number; // -1 to 1, влияние на цену
  sentiment?: 'bullish' | 'bearish' | 'neutral';
}

interface EnhancedNewsFeedProps {
  figi: string;
  ticker?: string;
  className?: string;
  maxItems?: number;
  showFilters?: boolean;
}

export const CATEGORY_LABELS: Record<NewsCategory, string> = {
  earnings: 'Отчетность',
  mergers: 'Слияния',
  macro: 'Макро',
  dividends: 'Дивиденды',
  guidance: 'Прогнозы',
  regulatory: 'Регуляция',
  other: 'Прочее',
};

export const CATEGORY_COLORS: Record<NewsCategory, string> = {
  earnings: 'var(--color-accent-primary)',
  mergers: 'var(--color-accent-info)',
  macro: 'var(--color-accent-warning)',
  dividends: 'var(--color-accent-success)',
  guidance: 'var(--color-accent-primary)',
  regulatory: 'var(--color-accent-error)',
  other: 'var(--color-text-secondary)',
};

const PRIORITY_COLORS: Record<NewsPriority, string> = {
  critical: 'var(--color-accent-error)',
  high: 'var(--color-accent-warning)',
  medium: 'var(--color-accent-primary)',
  low: 'var(--color-text-secondary)',
};

export const EnhancedNewsFeed: React.FC<EnhancedNewsFeedProps> = ({
  figi,
  ticker: _ticker, // Переименовано для избежания неиспользуемой переменной
  className = '',
  maxItems = 10,
  showFilters = true
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [news, setNews] = useState<EnhancedNewsItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<NewsCategory | 'all'>('all');
  const [selectedPriority, setSelectedPriority] = useState<NewsPriority | 'all'>('all');

  const categoryOptions = [
    { value: 'all', label: 'Все категории' },
    { value: 'earnings', label: CATEGORY_LABELS.earnings },
    { value: 'mergers', label: CATEGORY_LABELS.mergers },
    { value: 'macro', label: CATEGORY_LABELS.macro },
    { value: 'dividends', label: CATEGORY_LABELS.dividends },
    { value: 'guidance', label: CATEGORY_LABELS.guidance },
    { value: 'regulatory', label: CATEGORY_LABELS.regulatory },
    { value: 'other', label: CATEGORY_LABELS.other },
  ];

  const priorityOptions = [
    { value: 'all', label: 'Все приоритеты' },
    { value: 'critical', label: 'Критический' },
    { value: 'high', label: 'Высокий' },
    { value: 'medium', label: 'Средний' },
    { value: 'low', label: 'Низкий' },
  ];

  useEffect(() => {
    if (figi) {
      loadNews();
    }
  }, [figi]);

  const normalizeNewsResponse = (payload: any): any[] => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.news)) return payload.news;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  };

  const loadNews = async () => {
    setLoading(true);
    setError(null);
    try {
      const newsData = await apiService.getNews(figi, maxItems * 2, 30);
      const items = normalizeNewsResponse(newsData);

      if (items.length > 0) {
        // Обрабатываем новости с учетом классификации и затухания
        const processedNews = items.map((item: any) => {
          // Определяем категорию и приоритет (если не указаны в API)
          const category = item.category || classifyNewsCategory(item.title, item.description);
          const priority = item.priority || determinePriority(category, item);
          const importance = item.importance || calculateImportance(category, priority);
          const timeDecay = calculateTimeDecay(item.publishedAt);
          
          return {
            ...item,
            category,
            priority,
            importance,
            timeDecay,
            impactOnPrice: item.impactOnPrice || 0,
            sentiment: item.sentiment || 'neutral',
          };
        });

        // Сортируем по важности и времени затухания
        processedNews.sort((a: EnhancedNewsItem, b: EnhancedNewsItem) => {
          const aScore = (a.importance || 0) * (a.timeDecay || 1);
          const bScore = (b.importance || 0) * (b.timeDecay || 1);
          return bScore - aScore;
        });

        setNews(processedNews.slice(0, maxItems));
      }
    } catch (err: any) {
      console.error('Error loading news:', err);
      setError(err.message || 'Ошибка загрузки новостей');
    } finally {
      setLoading(false);
    }
  };

  // Классификация категории новости по тексту
  const classifyNewsCategory = (title: string, description?: string): NewsCategory => {
    const text = `${title} ${description || ''}`.toLowerCase();
    
    if (text.match(/отчет|earnings|результаты|прибыль|убыток|выручка/i)) return 'earnings';
    if (text.match(/слияние|merger|поглощение|acquisition/i)) return 'mergers';
    if (text.match(/дивиденд|dividend|выплата/i)) return 'dividends';
    if (text.match(/прогноз|guidance|outlook|forecast/i)) return 'guidance';
    if (text.match(/регулятор|regulatory|цб|центральный банк|федеральная резервная/i)) return 'regulatory';
    if (text.match(/ввп|инфляция|безработица|макро|gdp|inflation|unemployment/i)) return 'macro';
    
    return 'other';
  };

  // Определение приоритета
  const determinePriority = (category: NewsCategory, item: any): NewsPriority => {
    // Критичные категории
    if (category === 'earnings' || category === 'mergers') return 'high';
    if (category === 'regulatory') return 'high';
    
    // Проверяем важные слова в заголовке
    const title = item.title?.toLowerCase() || '';
    if (title.match(/критич|важно|срочно|breaking/i)) return 'critical';
    
    return 'medium';
  };

  // Расчет важности
  const calculateImportance = (category: NewsCategory, priority: NewsPriority): number => {
    const categoryWeights: Record<NewsCategory, number> = {
      earnings: 0.9,
      mergers: 0.85,
      regulatory: 0.8,
      dividends: 0.7,
      guidance: 0.65,
      macro: 0.6,
      other: 0.4,
    };

    const priorityWeights: Record<NewsPriority, number> = {
      critical: 1.0,
      high: 0.8,
      medium: 0.6,
      low: 0.4,
    };

    return categoryWeights[category] * priorityWeights[priority];
  };

  // Расчет временного затухания (экспоненциальное)
  const calculateTimeDecay = (publishedAt: string): number => {
    const now = new Date();
    const published = new Date(publishedAt);
    const hoursAgo = (now.getTime() - published.getTime()) / (1000 * 60 * 60);
    
    // Экспоненциальное затухание: через 24 часа = 0.5, через 48 часов = 0.25
    const halfLife = 24; // часов
    return Math.exp(-(hoursAgo / halfLife) * Math.LN2);
  };

  const filteredNews = useMemo(() => {
    return news.filter(item => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      if (selectedPriority !== 'all' && item.priority !== selectedPriority) return false;
      return true;
    });
  }, [news, selectedCategory, selectedPriority]);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);

      if (diffHours < 1) {
        return 'Только что';
      } else if (diffHours < 24) {
        return `${diffHours} ${diffHours === 1 ? 'час' : diffHours < 5 ? 'часа' : 'часов'} назад`;
      } else if (diffDays < 7) {
        return `${diffDays} ${diffDays === 1 ? 'день' : diffDays < 5 ? 'дня' : 'дней'} назад`;
      } else {
        return date.toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
      }
    } catch {
      return '—';
    }
  };

  if (loading && news.length === 0) {
    return (
      <Card variant="glass" className={`enhanced-news-feed ${className}`}>
        <Skeleton width="100%" height={400} />
      </Card>
    );
  }

  return (
    <Card variant="glass" className={`enhanced-news-feed ${className}`}>
      <div className="news-feed-header">
        <h3 className="news-feed-title">Расширенная лента новостей</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadNews}
          loading={loading}
        >
          Обновить
        </Button>
      </div>

      {showFilters && (
        <div className="news-feed-filters">
          <Select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as NewsCategory | 'all')}
            options={categoryOptions}
            size="sm"
          />
          <Select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value as NewsPriority | 'all')}
            options={priorityOptions}
            size="sm"
          />
        </div>
      )}

      {error && (
        <div className="news-feed-error">
          <p>{error}</p>
        </div>
      )}

      {filteredNews.length > 0 ? (
        <div className="news-feed-content">
          {filteredNews.map((item, index) => {
            const opacity = item.timeDecay || 1;
            const categoryColor = item.category ? CATEGORY_COLORS[item.category] : 'var(--color-text-secondary)';
            const priorityColor = item.priority ? PRIORITY_COLORS[item.priority] : 'var(--color-text-secondary)';

            return (
              <div
                key={index}
                className="enhanced-news-item"
                style={{
                  opacity: 0.5 + (opacity * 0.5), // От 0.5 до 1.0
                  borderLeftColor: priorityColor,
                }}
              >
                <div className="news-item-header">
                  <div className="news-item-meta">
                    <Badge
                      variant={item.category === 'earnings' || item.category === 'mergers' ? 'primary' : 
                              item.category === 'regulatory' ? 'error' : 'info'}
                      size="sm"
                      style={{ backgroundColor: categoryColor + '20', color: categoryColor }}
                    >
                      {item.category ? CATEGORY_LABELS[item.category] : 'Прочее'}
                    </Badge>
                    <span className="news-item-time">{formatDate(item.publishedAt)}</span>
                    {item.source?.name && (
                      <span className="news-item-source">{item.source.name}</span>
                    )}
                  </div>
                  {item.priority && (
                    <Badge
                      variant={item.priority === 'critical' ? 'error' : 
                              item.priority === 'high' ? 'warning' : 'info'}
                      size="sm"
                    >
                      {item.priority === 'critical' ? 'Критично' :
                       item.priority === 'high' ? 'Высокий' :
                       item.priority === 'medium' ? 'Средний' : 'Низкий'}
                    </Badge>
                  )}
                </div>

                <h4 className="news-item-title">{item.title}</h4>
                
                {item.description && (
                  <p className="news-item-description">{item.description}</p>
                )}

                <div className="news-item-footer">
                  {item.impactOnPrice !== undefined && item.impactOnPrice !== 0 && (
                    <div className="news-item-impact">
                      <span className="impact-label">Влияние на цену:</span>
                      <span 
                        className={`impact-value ${item.impactOnPrice > 0 ? 'impact-positive' : 'impact-negative'}`}
                      >
                        {item.impactOnPrice > 0 ? '+' : ''}{(item.impactOnPrice * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                  {item.sentiment && (
                    <Badge
                      variant={item.sentiment === 'bullish' ? 'success' : 
                              item.sentiment === 'bearish' ? 'error' : 'neutral'}
                      size="sm"
                    >
                      {item.sentiment === 'bullish' ? 'Бычий' :
                       item.sentiment === 'bearish' ? 'Медвежий' : 'Нейтральный'}
                    </Badge>
                  )}
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="news-item-link"
                    >
                      Читать далее →
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="news-feed-empty">
          {loading ? 'Загрузка...' : 'Нет новостей'}
        </div>
      )}
    </Card>
  );
};

export default EnhancedNewsFeed;

