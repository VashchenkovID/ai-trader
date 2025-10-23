import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { Dialog } from 'primereact/dialog';
import { InputNumber } from 'primereact/inputnumber';
import { InputTextarea } from 'primereact/inputtextarea';
import { Toast } from 'primereact/toast';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Skeleton } from 'primereact/skeleton';
import { Message } from 'primereact/message';
import { Toolbar } from 'primereact/toolbar';
import { Dropdown } from 'primereact/dropdown';
import { Checkbox } from 'primereact/checkbox';
import apiServiceService from '../services/apiServiceService';

interface Recommendation {
  figi: string;
  ticker: string;
  name: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  score: number;
  analysis: any;
  explanation: any;
  priceAtAnalysis: number;
  targetPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  analysisDate: string;
  validUntil: string;
  isActive: boolean;
  sector?: string;
  tags: string[];
}

interface CreateRequestOptions {
  maxAmount?: number;
  stopLoss?: number;
  takeProfit?: number;
  comment?: string;
}

const RecommendationsViewer: React.FC = () => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [selectedRecommendations, setSelectedRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [currentRecommendation, setCurrentRecommendation] = useState<Recommendation | null>(null);
  const [createOptions, setCreateOptions] = useState<CreateRequestOptions>({});
  const [filterType, setFilterType] = useState<string>('all');
  const toast = React.useRef<Toast>(null);

  const filterOptions = [
    { label: 'Все рекомендации', value: 'all' },
    { label: 'Только BUY', value: 'BUY' },
    { label: 'Только SELL', value: 'SELL' },
    { label: 'Высокая уверенность (>80%)', value: 'high_confidence' },
    { label: 'Недавние (сегодня)', value: 'recent' }
  ];

  useEffect(() => {
    loadRecommendations();
    const interval = setInterval(loadRecommendations, 60000); // Обновляем каждую минуту
    return () => clearInterval(interval);
  }, [filterType]);

  const loadRecommendations = async () => {
    try {
      setLoading(true);
      
      // Получаем рекомендации (предполагаем, что есть API endpoint)
      let data;
      switch (filterType) {
        case 'BUY':
        case 'SELL':
          data = await apiService.getRecommendationsByType(filterType);
          break;
        case 'high_confidence':
          data = await apiService.getTopRecommendations(50);
          break;
        case 'recent':
          data = await apiService.getRecentRecommendations(50);
          break;
        default:
          data = await apiService.getAllRecommendations();
      }
      
      setRecommendations(data || []);
      
    } catch (error) {
      console.error('Error loading recommendations:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось загрузить рекомендации'
      });
      // Используем моковые данные для демонстрации
      setRecommendations([
        {
          figi: 'BBG004730N88',
          ticker: 'SBER',
          name: 'Сбербанк',
          recommendation: 'BUY',
          confidence: 0.85,
          score: 0.78,
          analysis: { technicalSignals: ['RSI oversold', 'MA crossover'] },
          explanation: { summary: 'Технические индикаторы показывают потенциал роста' },
          priceAtAnalysis: 285.50,
          targetPrice: 320.00,
          stopLoss: 270.00,
          analysisDate: new Date().toISOString(),
          validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          isActive: true,
          sector: 'Финансы',
          tags: ['high-confidence', 'technical-buy']
        },
        {
          figi: 'BBG004731354',
          ticker: 'GAZP',
          name: 'Газпром',
          recommendation: 'SELL',
          confidence: 0.72,
          score: 0.25,
          analysis: { fundamentalFactors: ['Declining margins', 'Regulatory pressure'] },
          explanation: { summary: 'Фундаментальные факторы указывают на снижение' },
          priceAtAnalysis: 165.20,
          targetPrice: 145.00,
          stopLoss: 175.00,
          analysisDate: new Date().toISOString(),
          validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          isActive: true,
          sector: 'Энергетика',
          tags: ['fundamental-sell']
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getRecommendationBadge = (recommendation: string) => {
    const config = {
      BUY: { severity: 'success', label: 'ПОКУПКА' },
      SELL: { severity: 'danger', label: 'ПРОДАЖА' },
      HOLD: { severity: 'info', label: 'ДЕРЖАТЬ' }
    };
    
    const rec = config[recommendation as keyof typeof config] || { severity: 'secondary', label: recommendation };
    return <Badge value={rec.label} severity={rec.severity as any} />;
  };

  const getConfidenceBadge = (confidence: number) => {
    const percentage = confidence * 100;
    let severity: 'success' | 'warning' | 'danger' | 'info' = 'info';
    
    if (percentage >= 80) severity = 'success';
    else if (percentage >= 60) severity = 'warning';
    else severity = 'danger';
    
    return <Badge value={`${percentage.toFixed(1)}%`} severity={severity} />;
  };

  const handleCreateRequest = (recommendation: Recommendation) => {
    if (recommendation.recommendation === 'HOLD') {
      toast.current?.show({
        severity: 'warn',
        summary: 'Предупреждение',
        detail: 'Нельзя создать заявку для рекомендации HOLD'
      });
      return;
    }
    
    setCurrentRecommendation(recommendation);
    setCreateOptions({
      stopLoss: recommendation.stopLoss,
      takeProfit: recommendation.targetPrice
    });
    setShowCreateDialog(true);
  };

  const confirmCreateRequest = async () => {
    if (!currentRecommendation) return;
    
    try {
      const request = await apiService.createTradingRequest(
        currentRecommendation.figi,
        createOptions
      );
      
      toast.current?.show({
        severity: 'success',
        summary: 'Заявка создана',
        detail: `Торговая заявка для ${currentRecommendation.ticker} создана успешно`
      });
      
      setShowCreateDialog(false);
      setCreateOptions({});
      
    } catch (error) {
      console.error('Error creating trading request:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось создать торговую заявку'
      });
    }
  };

  const handleBulkCreateRequests = async () => {
    if (selectedRecommendations.length === 0) return;
    
    const validRecommendations = selectedRecommendations.filter(r => r.recommendation !== 'HOLD');
    
    if (validRecommendations.length === 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Предупреждение',
        detail: 'Нет подходящих рекомендаций для создания заявок'
      });
      return;
    }
    
    confirmDialog({
      message: `Создать ${validRecommendations.length} торговых заявок?`,
      header: 'Массовое создание заявок',
      icon: 'pi pi-question-circle',
      accept: async () => {
        try {
          const figis = validRecommendations.map(r => r.figi);
          const result = await apiService.createBulkTradingRequests(figis);
          
          toast.current?.show({
            severity: 'success',
            summary: 'Заявки созданы',
            detail: `Создано ${result.requests?.length || 0} заявок`
          });
          
          setSelectedRecommendations([]);
          
        } catch (error) {
          console.error('Error creating bulk requests:', error);
          toast.current?.show({
            severity: 'error',
            summary: 'Ошибка',
            detail: 'Не удалось создать заявки'
          });
        }
      }
    });
  };

  const actionBodyTemplate = (rowData: Recommendation) => {
    if (rowData.recommendation === 'HOLD') {
      return <Badge value="Нет действий" severity="secondary" />;
    }
    
    return (
      <Button
        label="Создать заявку"
        icon="pi pi-plus"
        size="small"
        onClick={() => handleCreateRequest(rowData)}
      />
    );
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB'
    }).format(value);
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('ru-RU');
  };

  const toolbarTemplate = () => {
    return (
      <div className="flex justify-content-between align-items-center">
        <div className="flex gap-2 align-items-center">
          <Button
            label="Обновить"
            icon="pi pi-refresh"
            onClick={loadRecommendations}
            loading={loading}
            size="small"
          />
          
          <Dropdown
            value={filterType}
            options={filterOptions}
            onChange={(e) => setFilterType(e.value)}
            placeholder="Фильтр"
            className="w-12rem"
          />
          
          {selectedRecommendations.length > 0 && (
            <Button
              label={`Создать заявки (${selectedRecommendations.length})`}
              icon="pi pi-plus"
              onClick={handleBulkCreateRequests}
              severity="success"
              size="small"
            />
          )}
        </div>
        
        <div className="flex gap-2">
          <Badge value={`Всего: ${recommendations.length}`} severity="info" />
          <Badge 
            value={`BUY: ${recommendations.filter(r => r.recommendation === 'BUY').length}`} 
            severity="success" 
          />
          <Badge 
            value={`SELL: ${recommendations.filter(r => r.recommendation === 'SELL').length}`} 
            severity="danger" 
          />
        </div>
      </div>
    );
  };

  if (loading && recommendations.length === 0) {
    return (
      <Card title="📊 Рекомендации AI" className="h-full">
        <div className="grid">
          {[1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="col-12">
              <div className="flex align-items-center gap-3 p-3">
                <Skeleton width="4rem" height="3rem" />
                <div className="flex-1">
                  <Skeleton width="100%" height="1rem" className="mb-2" />
                  <Skeleton width="75%" height="0.8rem" />
                </div>
                <Skeleton width="6rem" height="2rem" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <div className="recommendations-viewer">
      <Toast ref={toast} />
      <ConfirmDialog />
      
      <Card title="📊 Рекомендации AI" className="h-full">
        <Toolbar template={toolbarTemplate} className="mb-3" />
        
        {recommendations.length === 0 ? (
          <Message severity="info" text="Нет доступных рекомендаций" />
        ) : (
          <DataTable
            value={recommendations}
            selection={selectedRecommendations}
            onSelectionChange={(e) => setSelectedRecommendations(e.value)}
            paginator
            rows={15}
            loading={loading}
            sortMode="multiple"
            removableSort
            className="p-datatable-sm"
            globalFilterFields={['ticker', 'name', 'sector']}
          >
            <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} />
            
            <Column
              field="ticker"
              header="Инструмент"
              sortable
              body={(rowData) => (
                <div>
                  <div className="font-bold">{rowData.ticker}</div>
                  <div className="text-sm text-600">{rowData.name}</div>
                  {rowData.sector && (
                    <div className="text-xs text-500">{rowData.sector}</div>
                  )}
                </div>
              )}
            />
            
            <Column
              field="recommendation"
              header="Рекомендация"
              sortable
              body={(rowData) => getRecommendationBadge(rowData.recommendation)}
            />
            
            <Column
              field="confidence"
              header="Уверенность"
              sortable
              body={(rowData) => getConfidenceBadge(rowData.confidence)}
            />
            
            <Column
              field="score"
              header="Оценка"
              sortable
              body={(rowData) => `${(rowData.score * 100).toFixed(1)}%`}
            />
            
            <Column
              field="priceAtAnalysis"
              header="Цена анализа"
              sortable
              body={(rowData) => formatCurrency(rowData.priceAtAnalysis)}
            />
            
            <Column
              field="targetPrice"
              header="Целевая цена"
              sortable
              body={(rowData) => rowData.targetPrice ? formatCurrency(rowData.targetPrice) : 'N/A'}
            />
            
            <Column
              field="analysisDate"
              header="Дата анализа"
              sortable
              body={(rowData) => formatDateTime(rowData.analysisDate)}
            />
            
            <Column
              field="validUntil"
              header="Действует до"
              sortable
              body={(rowData) => {
                const isExpired = new Date(rowData.validUntil) < new Date();
                return (
                  <span className={isExpired ? 'text-red-500' : ''}>
                    {formatDateTime(rowData.validUntil)}
                  </span>
                );
              }}
            />
            
            <Column
              header="Действия"
              body={actionBodyTemplate}
              headerStyle={{ width: '8rem' }}
            />
          </DataTable>
        )}
      </Card>

      {/* Диалог создания заявки */}
      <Dialog
        header="Создание торговой заявки"
        visible={showCreateDialog}
        onHide={() => setShowCreateDialog(false)}
        style={{ width: '500px' }}
      >
        {currentRecommendation && (
          <div>
            <div className="mb-4 p-3 border-1 border-200 border-round">
              <div className="flex justify-content-between align-items-center mb-2">
                <span className="font-bold text-lg">{currentRecommendation.ticker}</span>
                {getRecommendationBadge(currentRecommendation.recommendation)}
              </div>
              <div className="text-600 mb-2">{currentRecommendation.name}</div>
              <div className="grid">
                <div className="col-6">
                  <small className="text-500">Уверенность:</small>
                  <div>{(currentRecommendation.confidence * 100).toFixed(1)}%</div>
                </div>
                <div className="col-6">
                  <small className="text-500">Текущая цена:</small>
                  <div>{formatCurrency(currentRecommendation.priceAtAnalysis)}</div>
                </div>
              </div>
            </div>
            
            <div className="grid">
              <div className="col-12">
                <label htmlFor="maxAmount">Максимальная сумма (₽)</label>
                <InputNumber
                  id="maxAmount"
                  value={createOptions.maxAmount}
                  onValueChange={(e) => setCreateOptions({...createOptions, maxAmount: e.value || undefined})}
                  mode="currency"
                  currency="RUB"
                  locale="ru-RU"
                  className="w-full"
                  placeholder="Оставьте пустым для автоматического расчета"
                />
              </div>
              
              <div className="col-6">
                <label htmlFor="stopLoss">Stop Loss (₽)</label>
                <InputNumber
                  id="stopLoss"
                  value={createOptions.stopLoss}
                  onValueChange={(e) => setCreateOptions({...createOptions, stopLoss: e.value || undefined})}
                  mode="currency"
                  currency="RUB"
                  locale="ru-RU"
                  className="w-full"
                />
              </div>
              
              <div className="col-6">
                <label htmlFor="takeProfit">Take Profit (₽)</label>
                <InputNumber
                  id="takeProfit"
                  value={createOptions.takeProfit}
                  onValueChange={(e) => setCreateOptions({...createOptions, takeProfit: e.value || undefined})}
                  mode="currency"
                  currency="RUB"
                  locale="ru-RU"
                  className="w-full"
                />
              </div>
              
              <div className="col-12">
                <label htmlFor="comment">Комментарий</label>
                <InputTextarea
                  id="comment"
                  value={createOptions.comment || ''}
                  onChange={(e) => setCreateOptions({...createOptions, comment: e.target.value})}
                  rows={3}
                  className="w-full"
                  placeholder="Добавьте комментарий к заявке..."
                />
              </div>
            </div>
            
            <div className="flex justify-content-end gap-2 mt-4">
              <Button
                label="Отмена"
                icon="pi pi-times"
                onClick={() => setShowCreateDialog(false)}
                severity="secondary"
              />
              <Button
                label="Создать заявку"
                icon="pi pi-check"
                onClick={confirmCreateRequest}
                severity="success"
              />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};

export default RecommendationsViewer;
