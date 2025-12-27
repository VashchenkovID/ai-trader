import React from 'react';
import { Card } from '../ui/Card/Card';
import { Badge } from '../ui/Badge/Badge';
import { Button } from '../ui/Button/Button';
import { Skeleton } from '../ui/Skeleton/Skeleton';
import './PreflightCheckCard.css';

interface PreflightCheckResults {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
  }>;
}

interface PreflightCheckCardProps {
  preflightResults: PreflightCheckResults | null;
  preflightRunning: boolean;
  onRun: () => void;
}

const PreflightCheckCard: React.FC<PreflightCheckCardProps> = ({
  preflightResults,
  preflightRunning,
  onRun
}) => {
  return (
    <Card variant="glass" header="✅ Проверка готовности" className="preflight-check-card">
      <div className="preflight-check-content">
        {preflightRunning ? (
          <div className="preflight-check-loading">
            <Skeleton variant="text" size="md" style={{ width: '100%', marginBottom: '1rem' }} />
            <Skeleton variant="text" size="sm" style={{ width: '80%' }} />
          </div>
        ) : preflightResults ? (
          <>
            <div className="preflight-check-summary">
              <Badge 
                variant={preflightResults.passed ? 'success' : 'error'} 
                size="md"
              >
                {preflightResults.passed ? 'Все проверки пройдены' : 'Есть проблемы'}
              </Badge>
            </div>
            <div className="preflight-check-results">
              {preflightResults.checks.map((check, index) => (
                <div key={index} className="preflight-check-item">
                  <div className="preflight-check-item-content">
                    <div className="preflight-check-item-name">{check.name}</div>
                    <div className="preflight-check-item-message">{check.message}</div>
                  </div>
                  <Badge 
                    variant={check.passed ? 'success' : 'error'} 
                    size="sm"
                  >
                    {check.passed ? '✓' : '✗'}
                  </Badge>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="preflight-check-empty">
            <p className="preflight-check-empty-text">Проверка еще не выполнялась</p>
          </div>
        )}

        <div className="preflight-check-actions">
          <Button
            onClick={onRun}
            loading={preflightRunning}
            disabled={preflightRunning}
            size="sm"
            icon={<i className="pi pi-check-circle"></i>}
            fullWidth
          >
            Запустить проверку
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default PreflightCheckCard;

