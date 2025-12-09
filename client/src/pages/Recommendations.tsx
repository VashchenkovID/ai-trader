import React, { useState, useEffect, useRef } from 'react';
import { Card } from 'primereact/card';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { Dialog } from 'primereact/dialog';
import { InputNumber } from 'primereact/inputnumber';
import { InputTextarea } from 'primereact/inputtextarea';
import { Toast } from 'primereact/toast';
import { Dropdown } from 'primereact/dropdown';
import { Message } from 'primereact/message';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/apiService';
import { translateSector } from '../utils/sectorTranslator';
import { translateRecommendation } from '../utils/recommendationTranslator';
import { getConfidenceDescription } from '../utils/confidenceTranslator';

interface Recommendation {
  figi: string;
  ticker: string;
  name: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  score: number;
  priceAtAnalysis: number;
  targetPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  sector?: string;
  analysisDate: string;
  isActive: boolean;
  explanation?: any; // JSON с объяснением стратегии
  analysis?: any; // JSON с деталями анализа
}

const Recommendations: React.FC = () => {
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuyDialog, setShowBuyDialog] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState<Recommendation | null>(null);
  const [buyQuantity, setBuyQuantity] = useState<number>(0);
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [userReason, setUserReason] = useState<string>('');
  const [showHoldWarning, setShowHoldWarning] = useState(false);
  const toast = useRef<Toast>(null);

  const filterOptions = [
    { label: 'Все рекомендации', value: 'all' },
    { label: `Только ${translateRecommendation('BUY')}`, value: 'BUY' },
    { label: `Только ${translateRecommendation('SELL')}`, value: 'SELL' },
    { label: `Только ${translateRecommendation('HOLD')}`, value: 'HOLD' }
  ];

  useEffect(() => {
    loadRecommendations(); // Просто загружаем из БД без обновления предсказаний
    const interval = setInterval(() => loadRecommendations(), 60000); // Обновляем каждую минуту
    return () => clearInterval(interval);
  }, [filterType]);

  const loadRecommendations = async () => {
    try {
      setLoading(true);
      
      let data;
      if (filterType === 'all') {
        data = await apiService.getAllRecommendations();
      } else {
        data = await apiService.getRecommendationsByType(filterType);
      }
      
      // Обрабатываем ответ
      let recommendationsData = [];
      if (Array.isArray(data)) {
        recommendationsData = data;
      } else if (data?.data && Array.isArray(data.data)) {
        recommendationsData = data.data;
      }
      
      // Фильтруем только активные рекомендации и просто отображаем данные из БД
      // Предсказания обновляются автоматически на бэкенде каждые 20 минут через планировщик
      recommendationsData = recommendationsData
        .filter((rec: any) => rec.isActive !== false)
        .map((rec: any) => ({
          figi: rec.figi || rec.id,
          ticker: rec.ticker || '',
          name: rec.name || 'Неизвестно',
          recommendation: rec.recommendation || rec.action || 'HOLD',
          confidence: rec.confidence || 0,
          score: rec.score || 0,
          priceAtAnalysis: rec.priceAtAnalysis || rec.price || 0,
          targetPrice: rec.targetPrice,
          stopLoss: rec.stopLoss,
          takeProfit: rec.takeProfit,
          sector: rec.sector,
          analysisDate: rec.analysisDate || rec.createdAt || new Date().toISOString(),
          isActive: rec.isActive !== undefined ? rec.isActive : true,
          explanation: rec.explanation || null,
          analysis: rec.analysis || null
        }));
      
      setRecommendations(recommendationsData);
    } catch (error: any) {
      console.error('Error loading recommendations:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось загрузить рекомендации',
        life: 5000
      });
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
      return '—';
    }
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '—';
    }
  };

  const recommendationTemplate = (rowData: Recommendation) => {
    const severity =
      rowData.recommendation === 'BUY' ? 'success' :
      rowData.recommendation === 'SELL' ? 'danger' : 'info';
    
    return (
      <Tag value={translateRecommendation(rowData.recommendation)} severity={severity as any} />
    );
  };

  const confidenceTemplate = (rowData: Recommendation) => {
    const confidenceDesc = getConfidenceDescription(rowData.confidence, 'confidence');
    const scoreDesc = getConfidenceDescription(rowData.score, 'score');
    
    return (
      <div className="flex flex-column">
        <div className={`font-medium ${confidenceDesc.color}`}>
          Уверенность: {confidenceDesc.text} ({confidenceDesc.percentage})
        </div>
        <div className={`text-sm ${scoreDesc.color}`}>
          Оценка: {scoreDesc.text} ({scoreDesc.percentage})
        </div>
      </div>
    );
  };

  const strategyTemplate = (rowData: Recommendation) => {
    // Извлекаем описание стратегии из explanation
    let strategyText = '';
    
    if (rowData.explanation) {
      if (typeof rowData.explanation === 'string') {
        strategyText = rowData.explanation;
      } else if (typeof rowData.explanation === 'object') {
        // Приоритет: summary > краткое описание из других полей
        if (rowData.explanation.summary) {
          strategyText = rowData.explanation.summary;
        } else if (rowData.explanation.brief) {
          strategyText = rowData.explanation.brief;
        } else if (rowData.explanation.keyFactors && Array.isArray(rowData.explanation.keyFactors)) {
          strategyText = `Ключевые факторы: ${rowData.explanation.keyFactors.slice(0, 2).join(', ')}`;
        } else if (rowData.explanation.reason) {
          strategyText = rowData.explanation.reason;
        }
      }
    }
    
    // Если нет explanation, используем данные из analysis
    if (!strategyText && rowData.analysis) {
      if (typeof rowData.analysis === 'object') {
        if (rowData.analysis.strategy) {
          strategyText = rowData.analysis.strategy;
        } else if (rowData.analysis.reason) {
          strategyText = rowData.analysis.reason;
        }
      }
    }
    
    // Если все еще нет текста, используем дефолтное описание на основе рекомендации
    if (!strategyText) {
      if (rowData.recommendation === 'BUY') {
        strategyText = 'Сигнал на покупку на основе технического и фундаментального анализа';
      } else if (rowData.recommendation === 'SELL') {
        strategyText = 'Рекомендация к продаже для защиты капитала';
      } else {
        strategyText = 'Рекомендация к удержанию позиции';
      }
    }
    
    // Ограничиваем длину текста для таблицы
    const maxLength = 100;
    const displayText = strategyText.length > maxLength 
      ? strategyText.substring(0, maxLength) + '...' 
      : strategyText;
    
    return (
      <div className="flex flex-column" style={{ maxWidth: '300px' }}>
        <div className="text-sm text-600" title={strategyText}>
          {displayText}
        </div>
        {rowData.explanation?.timeframe && (
          <div className="text-xs text-500 mt-1">
            Горизонт: {rowData.explanation.timeframe}
          </div>
        )}
      </div>
    );
  };

  const priceTemplate = (rowData: Recommendation) => {
    return (
      <div>
        <div className="font-medium">{formatCurrency(rowData.priceAtAnalysis)}</div>
        {rowData.targetPrice && (
          <div className="text-sm text-green-500">Цель: {formatCurrency(rowData.targetPrice)}</div>
        )}
      </div>
    );
  };

  const sectorTemplate = (rowData: Recommendation) => {
    if (!rowData.sector) return <span>—</span>;
    const translatedSector = translateSector(rowData.sector);
    return <Tag value={translatedSector} severity="info" />;
  };

  const handleBuyClick = (recommendation: Recommendation) => {
    setSelectedRecommendation(recommendation);
    // Рассчитываем примерное количество акций (на 10% от бюджета, если есть цена)
    const estimatedQuantity = recommendation.priceAtAnalysis > 0 
      ? Math.floor((100000 / recommendation.priceAtAnalysis) * 0.1) // Примерно 10к рублей
      : 1;
    setBuyQuantity(estimatedQuantity);
    setUserReason('');
    // Показываем предупреждение для HOLD рекомендаций
    setShowHoldWarning(recommendation.recommendation === 'HOLD');
    setShowBuyDialog(true);
  };

  const handleBuyConfirm = async () => {
    if (!selectedRecommendation || !buyQuantity || buyQuantity <= 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Ошибка',
        detail: 'Укажите количество акций для покупки',
        life: 3000
      });
      return;
    }

    try {
      setCreatingRequest(true);
      
      const recommendationData = {
        figi: selectedRecommendation.figi,
        ticker: selectedRecommendation.ticker,
        name: selectedRecommendation.name,
        recommendation: 'BUY', // Всегда создаем заявку на покупку
        confidence: selectedRecommendation.confidence,
        score: selectedRecommendation.score,
        priceAtAnalysis: selectedRecommendation.priceAtAnalysis,
        price: selectedRecommendation.priceAtAnalysis,
        targetPrice: selectedRecommendation.targetPrice,
        stopLoss: selectedRecommendation.stopLoss,
        takeProfit: selectedRecommendation.takeProfit
      };

      await apiService.createTradingRequest(
        selectedRecommendation.figi,
        { 
          quantity: Math.floor(buyQuantity),
          comment: userReason ? `Причина отклонения AI-рекомендации: ${userReason}` : undefined
        },
        recommendationData
      );

      toast.current?.show({
        severity: 'success',
        summary: 'Заявка создана',
        detail: `Заявка на покупку ${Math.floor(buyQuantity)} шт. ${selectedRecommendation.ticker} успешно создана`,
        life: 3000
      });

      setShowBuyDialog(false);
      setSelectedRecommendation(null);
      setBuyQuantity(0);
      setUserReason('');
      setShowHoldWarning(false);
      
      // Обновляем список рекомендаций
      loadRecommendations();
    } catch (error: any) {
      console.error('Error creating buy request:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: error.response?.data?.message || error.message || 'Не удалось создать заявку на покупку',
        life: 5000
      });
    } finally {
      setCreatingRequest(false);
    }
  };

  const buyButtonTemplate = (rowData: Recommendation) => {
    // Показываем кнопку для всех типов рекомендаций (BUY, SELL, HOLD)
    const buttonLabel = rowData.recommendation === 'BUY' 
      ? 'Купить' 
      : rowData.recommendation === 'SELL'
      ? 'Купить' // Для SELL тоже можно создать заявку на покупку (контринтуитивно, но пользователь может)
      : 'Купить'; // Для HOLD тоже показываем кнопку
    
    const buttonSeverity = rowData.recommendation === 'BUY' 
      ? 'success' 
      : rowData.recommendation === 'SELL'
      ? 'warning'
      : 'info'; // Для HOLD используем info цвет
    
    const tooltipText = rowData.recommendation === 'HOLD'
      ? 'Создать заявку на покупку (AI рекомендует удержание)'
      : 'Создать заявку на покупку';

    return (
      <Button
        icon="pi pi-shopping-cart"
        label={buttonLabel}
        size="small"
        severity={buttonSeverity}
        onClick={() => handleBuyClick(rowData)}
        disabled={!rowData.priceAtAnalysis || rowData.priceAtAnalysis <= 0}
        tooltip={tooltipText}
        tooltipOptions={{ position: 'top' }}
      />
    );
  };

  const buyDialogFooter = (
    <div>
      <Button 
        label="Отмена" 
        icon="pi pi-times" 
        onClick={() => {
          setShowBuyDialog(false);
          setSelectedRecommendation(null);
          setBuyQuantity(0);
        }} 
        className="p-button-text" 
        disabled={creatingRequest}
      />
      <Button 
        label="Создать заявку" 
        icon="pi pi-check" 
        onClick={handleBuyConfirm} 
        severity="success"
        loading={creatingRequest}
        disabled={!buyQuantity || buyQuantity <= 0}
      />
    </div>
  );

  return (
    <div className="recommendations-page p-4">
      <Toast ref={toast} />
      
      <Card title="📊 Рекомендации AI для торговли" className="mb-4">
        <div className="flex justify-content-between align-items-center mb-3">
          <div className="flex align-items-center gap-3">
            <span className="text-600">Фильтр:</span>
            <Dropdown
              value={filterType}
              options={filterOptions}
              onChange={(e) => setFilterType(e.value)}
              placeholder="Выберите фильтр"
              style={{ minWidth: '200px' }}
            />
            <Button
              icon="pi pi-refresh"
              label="Обновить"
              size="small"
                      onClick={() => loadRecommendations()}
              loading={loading}
            />
          </div>
          <div className="text-sm text-600">
            Всего рекомендаций: <strong>{recommendations.length}</strong>
          </div>
        </div>

        {recommendations.length === 0 && !loading && (
          <Message 
            severity="info" 
            text="Нет активных рекомендаций. Запустите анализ портфеля для получения рекомендаций." 
            className="mb-3"
          />
        )}

        <DataTable
          value={recommendations}
          loading={loading}
          emptyMessage="Нет рекомендаций"
          paginator={recommendations.length > 10}
          rows={10}
          sortMode="multiple"
          className="p-datatable-sm"
          globalFilterFields={['ticker', 'name', 'recommendation', 'sector']}
        >
          <Column
            field="name"
            header="Инструмент"
            sortable
            style={{ minWidth: '250px' }}
            body={(rowData: Recommendation) => (
              <div 
                className="cursor-pointer hover:text-primary transition-colors"
                onClick={() => navigate(`/stock/${rowData.figi}`)}
                title="Нажмите для просмотра детальной информации"
              >
                <div className="font-medium">{rowData.name}</div>
                <div className="text-sm text-600">{rowData.ticker}</div>
              </div>
            )}
          />
          <Column
            field="recommendation"
            header="Рекомендация"
            body={recommendationTemplate}
            sortable
            style={{ minWidth: '150px' }}
          />
          <Column
            field="confidence"
            header="Уверенность / Score"
            body={confidenceTemplate}
            sortable
            style={{ minWidth: '180px' }}
          />
          <Column
            field="priceAtAnalysis"
            header="Цена"
            body={priceTemplate}
            sortable
            style={{ minWidth: '150px' }}
          />
          <Column
            field="sector"
            header="Сектор"
            body={sectorTemplate}
            sortable
            style={{ minWidth: '150px' }}
          />
          <Column
            field="explanation"
            header="Описание стратегии"
            body={strategyTemplate}
            style={{ minWidth: '300px', maxWidth: '400px' }}
          />
          <Column
            field="analysisDate"
            header="Дата анализа"
            body={(rowData: Recommendation) => formatDate(rowData.analysisDate)}
            sortable
            style={{ minWidth: '150px' }}
          />
          <Column
            field="action"
            header="Действие"
            body={buyButtonTemplate}
            style={{ minWidth: '120px' }}
            frozen
            alignFrozen="right"
          />
        </DataTable>
      </Card>

      {/* Диалог покупки */}
      <Dialog
        header="Создание заявки на покупку"
        visible={showBuyDialog}
        style={{ width: '500px' }}
        footer={buyDialogFooter}
        onHide={() => {
          setShowBuyDialog(false);
          setSelectedRecommendation(null);
          setBuyQuantity(0);
          setUserReason('');
          setShowHoldWarning(false);
        }}
        modal
      >
        {selectedRecommendation && (
          <div className="flex flex-column gap-3">
            <div>
              <label className="block mb-2 font-medium">
                Инструмент: <strong>{selectedRecommendation.name} ({selectedRecommendation.ticker})</strong>
              </label>
            </div>
            <div>
              <label className="block mb-2 font-medium">
                Текущая цена: <strong>{formatCurrency(selectedRecommendation.priceAtAnalysis)}</strong>
              </label>
            </div>
            <div>
              <label className="block mb-2 font-medium">
                Рекомендация AI: <strong>{translateRecommendation(selectedRecommendation.recommendation)}</strong>
              </label>
            </div>
            <div>
              <label className="block mb-2 font-medium">
                Уверенность: <strong>{formatPercent(selectedRecommendation.confidence)}</strong>
              </label>
            </div>
            {selectedRecommendation.targetPrice && (
              <div>
                <label className="block mb-2 font-medium">
                  Целевая цена: <strong className="text-green-500">{formatCurrency(selectedRecommendation.targetPrice)}</strong>
                </label>
              </div>
            )}
            {showHoldWarning && (
              <div className="p-3 bg-yellow-50 border-round border-yellow-200 border-2">
                <div className="flex align-items-start gap-2">
                  <i className="pi pi-exclamation-triangle text-yellow-600 mt-1"></i>
                  <div className="flex-1">
                    <div className="font-bold text-yellow-800 mb-2">
                      ⚠️ Внимание: AI рекомендует HOLD
                    </div>
                    <div className="text-sm text-yellow-700 mb-2">
                      Вы создаете заявку на покупку, хотя AI рекомендует удержание позиции. 
                      Убедитесь, что у вас есть веские причины для этого решения.
                    </div>
                    <div>
                      <label htmlFor="userReason" className="block mb-2 text-sm font-medium text-yellow-800">
                        Причина отклонения рекомендации AI (необязательно):
                      </label>
                      <InputTextarea
                        id="userReason"
                        value={userReason}
                        onChange={(e) => setUserReason(e.target.value)}
                        rows={3}
                        placeholder="Например: Дополнительный анализ показал потенциал роста..."
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div>
              <label htmlFor="buyQuantity" className="block mb-2 font-medium">
                Количество акций для покупки:
              </label>
              <InputNumber
                id="buyQuantity"
                value={buyQuantity}
                onValueChange={(e) => setBuyQuantity(e.value || 0)}
                min={1}
                showButtons
                buttonLayout="horizontal"
                decrementButtonClassName="p-button-danger"
                incrementButtonClassName="p-button-success"
                incrementButtonIcon="pi pi-plus"
                decrementButtonIcon="pi pi-minus"
                className="w-full"
              />
            </div>
            {buyQuantity > 0 && selectedRecommendation.priceAtAnalysis > 0 && (
              <div className="mt-2 p-3 bg-blue-50 border-round">
                <div className="text-sm text-600 mb-1">Сумма покупки:</div>
                <div className="text-xl font-bold text-blue-600">
                  {formatCurrency(buyQuantity * selectedRecommendation.priceAtAnalysis)}
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
};

export default Recommendations;

