import React, { useState } from 'react';
import { Card } from '../ui/Card/Card';
import { Button } from '../ui/Button/Button';
import { ProgressBar } from '../ui/ProgressBar/ProgressBar';
import { Badge } from '../ui/Badge/Badge';
import { apiService } from '../../services/apiService';
import './QuarterlyDataSection.css';

const QuarterlyDataSection: React.FC = () => {
  const [updatingFundamental, setUpdatingFundamental] = useState(false);
  const [updatingOptions, setUpdatingOptions] = useState(false);
  const [fundamentalResult, setFundamentalResult] = useState<any>(null);
  const [optionsResult, setOptionsResult] = useState<any>(null);

  const handleUpdateFundamentalData = async () => {
    if (!window.confirm('Обновление фундаментальных данных может занять некоторое время. Продолжить?')) {
      return;
    }

    setUpdatingFundamental(true);
    setFundamentalResult(null);

    try {
      const result = await apiService.updateFundamentalData({
        syncAssets: true,
        forceUpdate: false
      });

      setFundamentalResult(result);

      if (result.success) {
        alert('Фундаментальные данные успешно обновлены!');
      } else {
        alert(`Ошибка обновления: ${result.message || 'Неизвестная ошибка'}`);
      }
    } catch (error: any) {
      console.error('Error updating fundamental data:', error);
      setFundamentalResult({
        success: false,
        message: error.message || 'Ошибка обновления фундаментальных данных'
      });
      alert(`Ошибка обновления: ${error.message || 'Неизвестная ошибка'}`);
    } finally {
      setUpdatingFundamental(false);
    }
  };

  const handleUpdateOptionsData = async () => {
    if (!window.confirm('Обновление опционных данных может занять некоторое время. Продолжить?')) {
      return;
    }

    setUpdatingOptions(true);
    setOptionsResult(null);

    try {
      const result = await apiService.updateOptionsData({
        forceUpdate: false,
        delayMs: 2000
      });

      setOptionsResult(result);

      if (result.success) {
        alert('Опционные данные успешно обновлены!');
      } else {
        alert(`Ошибка обновления: ${result.message || 'Неизвестная ошибка'}`);
      }
    } catch (error: any) {
      console.error('Error updating options data:', error);
      setOptionsResult({
        success: false,
        message: error.message || 'Ошибка обновления опционных данных'
      });
      alert(`Ошибка обновления: ${error.message || 'Неизвестная ошибка'}`);
    } finally {
      setUpdatingOptions(false);
    }
  };

  const formatStats = (stats: any) => {
    if (!stats) return null;

    return (
      <div className="quarterly-data-stats">
        <div className="quarterly-data-stat-item">
          <span className="quarterly-data-stat-label">Обработано активов:</span>
          <Badge variant="info" size="sm">{stats.totalAssets || 0}</Badge>
        </div>
        <div className="quarterly-data-stat-item">
          <span className="quarterly-data-stat-label">Обработано инструментов:</span>
          <Badge variant="info" size="sm">{stats.totalInstruments || 0}</Badge>
        </div>
        <div className="quarterly-data-stat-item">
          <span className="quarterly-data-stat-label">Сохранено записей:</span>
          <Badge variant="success" size="sm">{stats.saved || 0}</Badge>
        </div>
        <div className="quarterly-data-stat-item">
          <span className="quarterly-data-stat-label">Пропущено:</span>
          <Badge variant="warning" size="sm">{stats.skipped || 0}</Badge>
        </div>
        {stats.errors > 0 && (
          <div className="quarterly-data-stat-item">
            <span className="quarterly-data-stat-label">Ошибок:</span>
            <Badge variant="danger" size="sm">{stats.errors || 0}</Badge>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Фундаментальные данные */}
      <Card variant="glass" header="📊 Квартальные данные (фундаментальные показатели)" className="quarterly-data-section">
        <div className="quarterly-data-content">
          <div className="quarterly-data-description">
            <p>
              Фундаментальные показатели обновляются из Tinkoff API и включают:
            </p>
            <ul>
              <li>P/E (коэффициент цена/прибыль)</li>
              <li>P/B (коэффициент цена/балансовая стоимость)</li>
              <li>EV/EBITDA</li>
              <li>ROE (рентабельность собственного капитала)</li>
              <li>Долг/EBITDA</li>
              <li>Операционная маржа</li>
              <li>Чистая маржа</li>
            </ul>
            <p className="quarterly-data-note">
              <strong>Примечание:</strong> Данные обновляются редко (квартально) и используются для улучшения точности прогнозов нейросети, особенно для долгосрочных стратегий.
            </p>
          </div>

          {updatingFundamental && (
            <div className="quarterly-data-progress">
              <ProgressBar value={0} animated size="sm" />
              <div className="quarterly-data-progress-text">Обновление фундаментальных данных...</div>
              <div className="quarterly-data-progress-note">
                Это может занять несколько минут
              </div>
            </div>
          )}

          {fundamentalResult && fundamentalResult.data && formatStats(fundamentalResult.data.fundamentalsFill)}

          <div className="quarterly-data-actions">
            <Button
              onClick={handleUpdateFundamentalData}
              loading={updatingFundamental}
              disabled={updatingFundamental || updatingOptions}
              size="md"
              icon={<i className="pi pi-refresh"></i>}
              fullWidth
            >
              Обновить фундаментальные данные
            </Button>
          </div>
        </div>
      </Card>

      {/* Опционные данные */}
      <Card variant="glass" header="📈 Опционные данные (Implied Volatility)" className="quarterly-data-section">
        <div className="quarterly-data-content">
          <div className="quarterly-data-description">
            <p>
              Опционные данные обновляются из Tinkoff API и включают:
            </p>
            <ul>
              <li>Implied Volatility (IV) - подразумеваемая волатильность из опционов</li>
              <li>Цены опционов (call и put)</li>
              <li>Страйк-цены и даты экспирации</li>
              <li>Историческая волатильность (как fallback, если цена опциона недоступна)</li>
            </ul>
            <p className="quarterly-data-note">
              <strong>Примечание:</strong> Опционы обновляются ежедневно автоматически (в 01:00) и используются для улучшения точности прогнозов нейросети, особенно для краткосрочных и среднесрочных стратегий. Доступны только для ликвидных акций с опционами.
            </p>
          </div>

          {updatingOptions && (
            <div className="quarterly-data-progress">
              <ProgressBar value={0} animated size="sm" />
              <div className="quarterly-data-progress-text">Обновление опционных данных...</div>
              <div className="quarterly-data-progress-note">
                Это может занять несколько минут
              </div>
            </div>
          )}

          {optionsResult && optionsResult.data && (
            <div className="quarterly-data-stats">
              <div className="quarterly-data-stat-item">
                <span className="quarterly-data-stat-label">Обработано инструментов:</span>
                <Badge variant="info" size="sm">{optionsResult.data.processed || 0} / {optionsResult.data.total || 0}</Badge>
              </div>
              <div className="quarterly-data-stat-item">
                <span className="quarterly-data-stat-label">Сохранено опционов:</span>
                <Badge variant="success" size="sm">{optionsResult.data.saved || 0}</Badge>
              </div>
              {optionsResult.data.errors > 0 && (
                <div className="quarterly-data-stat-item">
                  <span className="quarterly-data-stat-label">Ошибок:</span>
                  <Badge variant="danger" size="sm">{optionsResult.data.errors || 0}</Badge>
                </div>
              )}
            </div>
          )}

          <div className="quarterly-data-actions">
            <Button
              onClick={handleUpdateOptionsData}
              loading={updatingOptions}
              disabled={updatingOptions || updatingFundamental}
              size="md"
              icon={<i className="pi pi-refresh"></i>}
              fullWidth
            >
              Обновить опционные данные
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
};

export default QuarterlyDataSection;

