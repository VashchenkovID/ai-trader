import React from 'react';
import { Dialog } from 'primereact/dialog';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { Badge } from 'primereact/badge';

export interface SellRecommendation {
  item: {
    figi: string;
    ticker: string;
    name: string;
    quantity: number;
    averagePrice: number;
  };
  prediction: {
    score: number;
    confidence: number;
    recommendation: string;
    explanation?: any;
  };
  reason: string;
}

interface PortfolioAnalysisResultsProps {
  visible: boolean;
  onHide: () => void;
  sellRecommendations: SellRecommendation[];
}

const PortfolioAnalysisResults: React.FC<PortfolioAnalysisResultsProps> = ({
  visible,
  onHide,
  sellRecommendations = []
}) => {
  const formatCurrency = (amount: number, currency: string = 'RUB') => {
    if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
      return '—';
    }
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const getRecommendationSeverity = (score: number): 'success' | 'warning' | 'danger' => {
    if (score < 0.2) return 'danger'; // Сильный сигнал на продажу
    if (score < 0.3) return 'warning'; // Умеренный сигнал на продажу
    return 'success'; // Удерживать
  };

  const getRecommendationLabel = (score: number): string => {
    if (score < 0.2) return 'Продать (сильный сигнал)';
    if (score < 0.3) return 'Продать (умеренный сигнал)';
    if (score >= 0.7) return 'Удерживать (хорошие перспективы)';
    return 'Удерживать';
  };

  const tickerTemplate = (rowData: SellRecommendation) => {
    const ticker = rowData.item.ticker || rowData.item.figi?.substring(0, 10) || '—';
    const name = rowData.item.name || 'Название недоступно';
    
    return (
      <div className="flex align-items-center gap-2">
        <div>
          <div className="font-medium">{name}</div>
          <div className="text-sm text-600">{ticker}</div>
        </div>
      </div>
    );
  };

  const scoreTemplate = (rowData: SellRecommendation) => {
    const score = rowData.prediction.score;
    const severity = getRecommendationSeverity(score);
    
    return (
      <div className="flex align-items-center gap-2">
        <Badge value={score.toFixed(3)} severity={severity} />
        <span className="text-sm text-600">
          {rowData.prediction.confidence ? `Уверенность: ${(rowData.prediction.confidence * 100).toFixed(1)}%` : ''}
        </span>
      </div>
    );
  };

  const recommendationTemplate = (rowData: SellRecommendation) => {
    const score = rowData.prediction.score;
    const label = getRecommendationLabel(score);
    const severity = getRecommendationSeverity(score);
    
    return <Tag value={label} severity={severity} />;
  };

  const reasonTemplate = (rowData: SellRecommendation) => {
    return (
      <div className="text-left">
        <div className="text-sm">{rowData.reason}</div>
        {rowData.prediction.explanation && (
          <div className="text-xs text-500 mt-1">
            {typeof rowData.prediction.explanation === 'string' 
              ? rowData.prediction.explanation 
              : rowData.prediction.explanation.summary || 'Детали недоступны'}
          </div>
        )}
      </div>
    );
  };

  const quantityTemplate = (rowData: SellRecommendation) => {
    return (
      <div className="text-left">
        <div className="font-medium">{rowData.item.quantity.toLocaleString('ru-RU')}</div>
        <div className="text-sm text-600">шт.</div>
      </div>
    );
  };

  const priceTemplate = (rowData: SellRecommendation) => {
    return (
      <div className="text-left">
        <div className="font-medium">
          {formatCurrency(rowData.item.averagePrice)}
        </div>
        <div className="text-sm text-600">Цена закупки</div>
      </div>
    );
  };

  return (
    <Dialog
      header="📊 Результаты анализа портфеля"
      visible={visible}
      onHide={onHide}
      style={{ width: '90vw', maxWidth: '1200px' }}
      modal
      className="p-fluid"
    >
      <div className="flex flex-column gap-4">
        {/* Сводка */}
        <div className="grid">
          <div className="col-12 md:col-4">
            <div className="p-3 border-round surface-100 text-center">
              <div className="text-2xl font-bold text-red-500 mb-2">
                {sellRecommendations.length}
              </div>
              <div className="text-600">Рекомендаций на продажу</div>
            </div>
          </div>
          <div className="col-12 md:col-4">
            <div className="p-3 border-round surface-100 text-center">
              <div className="text-2xl font-bold text-green-500 mb-2">
                {sellRecommendations.filter(r => r.prediction.score >= 0.3).length}
              </div>
              <div className="text-600">Позиций для удержания</div>
            </div>
          </div>
          <div className="col-12 md:col-4">
            <div className="p-3 border-round surface-100 text-center">
              <div className="text-2xl font-bold text-blue-500 mb-2">
                {sellRecommendations.filter(r => r.prediction.score < 0.2).length}
              </div>
              <div className="text-600">Сильных сигналов на продажу</div>
            </div>
          </div>
        </div>

        {/* Таблица рекомендаций */}
        {sellRecommendations.length > 0 ? (
          <div>
            <h3 className="mb-3">Рекомендации по позициям</h3>
            <DataTable
              value={sellRecommendations}
              emptyMessage="Нет рекомендаций на продажу"
              paginator={sellRecommendations.length > 10}
              rows={10}
              sortMode="multiple"
              className="p-datatable-sm"
            >
              <Column
                field="item.ticker"
                header="Инструмент"
                body={tickerTemplate}
                sortable
                style={{ minWidth: '200px' }}
              />
              <Column
                field="item.quantity"
                header="Количество"
                body={quantityTemplate}
                sortable
                style={{ minWidth: '120px' }}
              />
              <Column
                field="item.averagePrice"
                header="Цена закупки"
                body={priceTemplate}
                sortable
                style={{ minWidth: '140px' }}
              />
              <Column
                field="prediction.score"
                header="Score предсказания"
                body={scoreTemplate}
                sortable
                style={{ minWidth: '180px' }}
              />
              <Column
                field="prediction.recommendation"
                header="Рекомендация"
                body={recommendationTemplate}
                sortable
                style={{ minWidth: '200px' }}
              />
              <Column
                field="reason"
                header="Причина"
                body={reasonTemplate}
                style={{ minWidth: '300px' }}
              />
            </DataTable>
          </div>
        ) : (
          <div className="text-center p-4 text-600">
            <p>Все позиции в портфеле имеют хорошие перспективы. Рекомендуется удерживать текущие позиции.</p>
          </div>
        )}

        {/* Пояснение */}
        <div className="p-3 border-round surface-100">
          <h4 className="mb-2">Как интерпретировать результаты:</h4>
          <ul className="list-none p-0 m-0">
            <li className="mb-2">
              <strong className="text-red-500">Score &lt; 0.2:</strong> Сильный сигнал на продажу. Модель предсказывает падение цены.
            </li>
            <li className="mb-2">
              <strong className="text-orange-500">Score 0.2 - 0.3:</strong> Умеренный сигнал на продажу. Стоит рассмотреть частичную продажу.
            </li>
            <li className="mb-2">
              <strong className="text-green-500">Score &gt;= 0.3:</strong> Рекомендуется удерживать позицию. Модель предсказывает стабильность или рост.
            </li>
          </ul>
        </div>
      </div>
    </Dialog>
  );
};

export default PortfolioAnalysisResults;

