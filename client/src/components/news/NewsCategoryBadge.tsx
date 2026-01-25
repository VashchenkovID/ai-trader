import React from 'react';
import { Badge } from '../ui/Badge/Badge';
import { NewsCategory, CATEGORY_LABELS, CATEGORY_COLORS } from './EnhancedNewsFeed';

interface NewsCategoryBadgeProps {
  category: NewsCategory;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const NewsCategoryBadge: React.FC<NewsCategoryBadgeProps> = ({
  category,
  size = 'sm',
  className = ''
}) => {
  const getVariant = (): 'primary' | 'success' | 'error' | 'warning' | 'info' | 'neutral' => {
    switch (category) {
      case 'earnings':
      case 'guidance':
        return 'primary';
      case 'dividends':
        return 'success';
      case 'regulatory':
        return 'error';
      case 'macro':
        return 'warning';
      case 'mergers':
        return 'info';
      default:
        return 'neutral';
    }
  };

  return (
    <Badge
      variant={getVariant()}
      size={size}
      className={className}
      style={{
        backgroundColor: CATEGORY_COLORS[category] + '20',
        color: CATEGORY_COLORS[category],
      }}
    >
      {CATEGORY_LABELS[category]}
    </Badge>
  );
};

export default NewsCategoryBadge;

