import React from 'react';
import { Card } from '../ui/Card/Card';
import { Badge } from '../ui/Badge/Badge';
import { ProgressBar } from '../ui/ProgressBar/ProgressBar';
import { Alert } from '../ui/Alert/Alert';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import './TradingModeValidationCard.css';

interface TradingModeValidationCardProps {
  validation: any;
  currentMode: string | null;
}

const TradingModeValidationCard: React.FC<TradingModeValidationCardProps> = ({ 
  validation, 
  currentMode: _currentMode 
}) => {
  if (!validation) {
    return (
      <Card variant="glass" header="✅ Валидация режима торговли" className="trading-mode-validation-card">
        <div className="trading-mode-validation-skeleton">
          {[1, 2, 3].map((item) => (
            <div key={item} className="trading-mode-validation-skeleton-item">
              <Skeleton variant="text" size="md" style={{ width: '60%', marginBottom: '0.5rem' }} />
              <Skeleton variant="text" size="sm" style={{ width: '40%' }} />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const isValid = validation.isValid !== false;
  const checks = validation.checks || {};
  const warnings = validation.warnings || [];

  const getCheckStatus = (check: any) => {
    if (!check) return { passed: false, variant: 'error' as const };
    if (check.passed === true) return { passed: true, variant: 'success' as const };
    if (check.passed === false) return { passed: false, variant: 'error' as const };
    if (check.score !== undefined) {
      const score = typeof check.score === 'number' ? check.score : 0;
      if (score >= 0.8) return { passed: true, variant: 'success' as const };
      if (score >= 0.5) return { passed: false, variant: 'warning' as const };
      return { passed: false, variant: 'error' as const };
    }
    return { passed: false, variant: 'info' as const };
  };

  const renderCheck = (name: string, check: any, key: string) => {
    const status = getCheckStatus(check);
    const score = check?.score !== undefined ? (check.score * 100) : (check?.passed ? 100 : 0);
    const details = check?.details || {};
    // Обрабатываем message - может быть объектом
    const message = typeof check?.message === 'string' 
      ? check.message 
      : (typeof check?.reason === 'string' 
        ? check.reason 
        : (check?.message?.text || check?.message?.message || JSON.stringify(check?.message || check?.reason || 'Проверка не выполнена')));

    return (
      <div key={key} className="trading-mode-validation-check">
        <div className="trading-mode-validation-check-header">
          <div className="trading-mode-validation-check-name">{name}</div>
          <Badge variant={status.variant} size="sm">
            {status.passed ? '✅ Пройдено' : '❌ Не пройдено'}
          </Badge>
        </div>
        {check?.score !== undefined && (
          <div className="trading-mode-validation-check-progress">
            <ProgressBar value={score} />
            <span className="trading-mode-validation-check-score">{score.toFixed(0)}%</span>
          </div>
        )}
        <div className="trading-mode-validation-check-message">{message}</div>
        {Object.keys(details).length > 0 && (
          <div className="trading-mode-validation-check-details">
            {Object.entries(details).map(([detailKey, detailValue]: [string, any]) => (
              <div key={detailKey} className="trading-mode-validation-check-detail">
                <span className="trading-mode-validation-check-detail-key">{detailKey}:</span>
                <span className="trading-mode-validation-check-detail-value">
                  {typeof detailValue === 'object' ? JSON.stringify(detailValue) : String(detailValue)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card variant="glass" header="✅ Валидация режима торговли" className="trading-mode-validation-card">
      <div className="trading-mode-validation-content">
        {!isValid && (
          <Alert variant="error" className="trading-mode-validation-alert">
            Режим торговли не прошел валидацию. Проверьте детали ниже.
          </Alert>
        )}

        {warnings.length > 0 && (
          <Alert variant="warning" className="trading-mode-validation-alert">
            <div className="trading-mode-validation-warnings">
              <strong>Предупреждения:</strong>
              <ul>
                {warnings.map((warning: any, idx: number) => (
                  <li key={idx}>
                    {typeof warning === 'string' 
                      ? warning 
                      : (warning?.message || warning?.text || JSON.stringify(warning))}
                  </li>
                ))}
              </ul>
            </div>
          </Alert>
        )}

        {isValid && warnings.length === 0 && (
          <Alert variant="success" className="trading-mode-validation-alert">
            ✅ Все проверки пройдены успешно. Режим торговли готов к использованию.
          </Alert>
        )}

        <div className="trading-mode-validation-checks">
          {checks.riskMetrics && renderCheck('Риск-метрики', checks.riskMetrics, 'riskMetrics')}
          {checks.portfolioSettings && renderCheck('Настройки портфеля', checks.portfolioSettings, 'portfolioSettings')}
          {checks.systemReadiness && renderCheck('Готовность системы', checks.systemReadiness, 'systemReadiness')}
          {checks.tradingHistory && renderCheck('История торговли', checks.tradingHistory, 'tradingHistory')}
          {checks.performanceMetrics && renderCheck('Метрики производительности', checks.performanceMetrics, 'performanceMetrics')}
        </div>

        {validation.overallScore !== undefined && (
          <div className="trading-mode-validation-overall">
            <div className="trading-mode-validation-overall-header">
              <span>Общая оценка готовности</span>
              <Badge variant={validation.overallScore >= 0.8 ? 'success' : validation.overallScore >= 0.5 ? 'warning' : 'error'}>
                {(validation.overallScore * 100).toFixed(0)}%
              </Badge>
            </div>
            <ProgressBar value={validation.overallScore * 100} />
          </div>
        )}
      </div>
    </Card>
  );
};

export default TradingModeValidationCard;

