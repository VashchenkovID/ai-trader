import React from 'react';
import { Input } from '../ui';
import { Select } from '../ui';
import { Button } from '../ui';
import './RecommendationFilters.css';

interface Strategy {
  id: number;
  name: string;
  type: 'conservative' | 'moderate' | 'aggressive';
}

interface RecommendationFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filterType: string;
  onFilterTypeChange: (value: string) => void;
  filterConfidence: string;
  onFilterConfidenceChange: (value: string) => void;
  filterStrategy: number | null;
  onFilterStrategyChange: (value: number | null) => void;
  strategies: Strategy[];
  onRefresh?: () => void;
  loading?: boolean;
}

export const RecommendationFilters: React.FC<RecommendationFiltersProps> = ({
  searchTerm,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  filterConfidence,
  onFilterConfidenceChange,
  filterStrategy,
  onFilterStrategyChange,
  strategies,
  onRefresh,
  loading = false,
}) => {
  const typeOptions = [
    { value: 'all', label: 'Все рекомендации' },
    { value: 'BUY', label: 'Только покупки' },
    { value: 'SELL', label: 'Только продажи' },
    { value: 'HOLD', label: 'Только удержание' },
  ];

  const confidenceOptions = [
    { value: 'all', label: 'Все' },
    { value: 'high', label: 'Высокая (>80%)' },
    { value: 'medium', label: 'Средняя (50-80%)' },
    { value: 'low', label: 'Низкая (<50%)' },
  ];

  const strategyOptions = [
    { value: '', label: 'Все стратегии' },
    ...strategies.map((s) => ({
      value: String(s.id),
      label: s.name,
    })),
  ];

  return (
    <div className="recommendation-filters">
      <div className="recommendation-filters-row">
        <div className="recommendation-filters-search">
          <Input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Поиск по названию компании, тикеру или сектору..."
            leftIcon={<span>🔍</span>}
            fullWidth
            size="md"
          />
        </div>

        <div className="recommendation-filters-controls">
          <Select
            value={filterType}
            onChange={(e) => onFilterTypeChange(e.target.value)}
            options={typeOptions}
            placeholder="Тип рекомендации"
            size="md"
            fullWidth
          />

          <Select
            value={filterConfidence}
            onChange={(e) => onFilterConfidenceChange(e.target.value)}
            options={confidenceOptions}
            placeholder="Уверенность"
            size="md"
            fullWidth
          />

          <Select
            value={filterStrategy ? String(filterStrategy) : ''}
            onChange={(e) => onFilterStrategyChange(e.target.value ? Number(e.target.value) : null)}
            options={strategyOptions}
            placeholder="Стратегия"
            size="md"
            fullWidth
          />

          {onRefresh && (
            <Button
              variant="secondary"
              size="md"
              onClick={onRefresh}
              loading={loading}
              icon={<span>🔄</span>}
            >
              Обновить
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecommendationFilters;

