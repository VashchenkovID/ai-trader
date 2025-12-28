import React from 'react';
import { Card } from '../ui';
import { Button } from '../ui';
import { Select } from '../ui';
import { Input } from '../ui';
import './RecommendationsFiltersExtended.css';

interface RecommendationsFiltersExtendedProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filterType: string;
  onFilterTypeChange: (value: string) => void;
  filterConfidence: string;
  onFilterConfidenceChange: (value: string) => void;
  filterStrategy: number | null;
  onFilterStrategyChange: (value: number | null) => void;
  filterSector: string;
  onFilterSectorChange: (value: string) => void;
  filterPriority: string;
  onFilterPriorityChange: (value: string) => void;
  sortBy: string;
  onSortByChange: (value: string) => void;
  strategies: Array<{ id: number; name: string; type: string }>;
  sectors: string[];
  onRefresh: () => void;
  loading: boolean;
  onClearFilters: () => void;
}

export const RecommendationsFiltersExtended: React.FC<RecommendationsFiltersExtendedProps> = ({
  searchTerm,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  filterConfidence,
  onFilterConfidenceChange,
  filterStrategy,
  onFilterStrategyChange,
  filterSector,
  onFilterSectorChange,
  filterPriority,
  onFilterPriorityChange,
  sortBy,
  onSortByChange,
  strategies,
  sectors,
  onRefresh,
  loading,
  onClearFilters,
}) => {
  const filterTypeOptions = [
    { label: 'Все', value: 'all' },
    { label: '💰 Покупка', value: 'BUY' },
    { label: '💸 Продажа', value: 'SELL' },
    { label: '⏸️ Удержание', value: 'HOLD' },
  ];

  const filterConfidenceOptions = [
    { label: 'Все', value: 'all' },
    { label: 'Высокая (≥80%)', value: 'high' },
    { label: 'Средняя (50-80%)', value: 'medium' },
    { label: 'Низкая (<50%)', value: 'low' },
  ];

  const filterPriorityOptions = [
    { label: 'Все', value: 'all' },
    { label: '🔴 Критический', value: 'critical' },
    { label: '🟠 Высокий', value: 'high' },
    { label: '🟡 Средний', value: 'medium' },
    { label: '⚪ Низкий', value: 'low' },
  ];

  const sortByOptions = [
    { label: 'По уверенности', value: 'confidence' },
    { label: 'По потенциальной прибыли', value: 'profit' },
    { label: 'По риску', value: 'risk' },
    { label: 'По времени', value: 'time' },
  ];

  const strategyOptions = [
    { label: 'Все стратегии', value: '' },
    ...strategies.map((s) => ({ label: s.name, value: String(s.id) })),
  ];

  const sectorOptions = [
    { label: 'Все секторы', value: 'all' },
    ...sectors.map((s) => ({ label: s, value: s })),
  ];

  return (
    <Card variant="default" className="recommendations-filters-extended">
      <div className="recommendations-filters-extended-header">
        <h3 className="recommendations-filters-extended-title">🔍 Фильтры и сортировка</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          disabled={loading}
        >
          Очистить
        </Button>
      </div>

      <div className="recommendations-filters-extended-content">
        {/* Поиск */}
        <div className="recommendations-filters-extended-group">
          <label className="recommendations-filters-extended-label">Поиск</label>
          <Input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Поиск по тикеру, названию, сектору..."
            fullWidth
          />
        </div>

        {/* Тип рекомендации */}
        <div className="recommendations-filters-extended-group">
          <label className="recommendations-filters-extended-label">Тип рекомендации</label>
          <Select
            value={filterType}
            onChange={(e) => onFilterTypeChange(e.target.value as string)}
            options={filterTypeOptions}
            fullWidth
          />
        </div>

        {/* Уверенность */}
        <div className="recommendations-filters-extended-group">
          <label className="recommendations-filters-extended-label">Уверенность</label>
          <Select
            value={filterConfidence}
            onChange={(e) => onFilterConfidenceChange(e.target.value as string)}
            options={filterConfidenceOptions}
            fullWidth
          />
        </div>

        {/* Стратегия */}
        <div className="recommendations-filters-extended-group">
          <label className="recommendations-filters-extended-label">Стратегия</label>
          <Select
            value={filterStrategy !== null ? String(filterStrategy) : ''}
            onChange={(e) => onFilterStrategyChange(e.target.value ? Number(e.target.value) : null)}
            options={strategyOptions}
            fullWidth
          />
        </div>

        {/* Сектор */}
        <div className="recommendations-filters-extended-group">
          <label className="recommendations-filters-extended-label">Сектор</label>
          <Select
            value={filterSector}
            onChange={(e) => onFilterSectorChange(e.target.value as string)}
            options={sectorOptions}
            fullWidth
          />
        </div>

        {/* Приоритет */}
        <div className="recommendations-filters-extended-group">
          <label className="recommendations-filters-extended-label">Приоритет</label>
          <Select
            value={filterPriority}
            onChange={(e) => onFilterPriorityChange(e.target.value as string)}
            options={filterPriorityOptions}
            fullWidth
          />
        </div>

        {/* Сортировка */}
        <div className="recommendations-filters-extended-group">
          <label className="recommendations-filters-extended-label">Сортировка</label>
          <Select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as string)}
            options={sortByOptions}
            fullWidth
          />
        </div>

        {/* Кнопка обновления */}
        <div className="recommendations-filters-extended-actions">
          <Button
            variant="primary"
            size="md"
            onClick={onRefresh}
            loading={loading}
            fullWidth
            icon={<span>🔄</span>}
          >
            Обновить
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default RecommendationsFiltersExtended;

