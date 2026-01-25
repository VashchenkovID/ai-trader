import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../ui/Card/Card.tsx';
import { Button } from '../../ui/Button/Button.tsx';
import { apiService } from '../../../services/apiService.ts';
import './QuickActionsCard.css';

interface QuickActionsCardProps {
  className?: string;
}

export const QuickActionsCard: React.FC<QuickActionsCardProps> = ({ 
  className = '' 
}) => {
  const navigate = useNavigate();

  const handleMarketAnalysis = async () => {
    try {
      await apiService.activateNeuralNetwork();
      const response = await apiService.startMarketAnalysis();
      // Можно показать toast вместо alert
      console.log('Анализ запущен:', response?.message);
    } catch (e: any) {
      console.error('Ошибка запуска анализа рынка:', e);
    }
  };

  const quickActions = [
    {
      label: 'Анализ рынка',
      icon: 'pi pi-chart-line',
      action: handleMarketAnalysis,
      variant: 'primary' as const
    },
    {
      label: 'Портфель',
      icon: 'pi pi-briefcase',
      action: () => navigate('/portfolio'),
      variant: 'ghost' as const
    },
    {
      label: 'Рекомендации',
      icon: 'pi pi-star',
      action: () => navigate('/recommendations'),
      variant: 'ghost' as const
    },
    {
      label: 'Настройки',
      icon: 'pi pi-cog',
      action: () => navigate('/settings'),
      variant: 'ghost' as const
    }
  ];

  return (
    <Card 
      variant="glass" 
      header={<span>⚡ Быстрые действия</span>} 
      className={`h-full quick-actions-card ${className}`}
    >
      <div className="actions-grid">
        {quickActions.map((action, index) => (
          <div key={index} className="action-col">
            <Button
              variant={action.variant}
              size="sm"
              fullWidth
              icon={<i className={action.icon}></i>}
              onClick={action.action}
              className="quick-action-button"
            >
              {action.label}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default QuickActionsCard;

