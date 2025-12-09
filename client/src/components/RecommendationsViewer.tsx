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
import { Dropdown } from 'primereact/dropdown';
import { apiService } from '../services/apiService';
import { translateRecommendation } from '../utils/recommendationTranslator';

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
  quantity?: number;
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
  const [userReason, setUserReason] = useState<string>('');
  const toast = React.useRef<Toast>(null);

  const filterOptions = [
    { label: 'Все рекомендации', value: 'all' },
    { label: `Только ${translateRecommendation('BUY')}`, value: 'BUY' },
    { label: `Только ${translateRecommendation('SELL')}`, value: 'SELL' },
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
      
      // Получаем рекомендации с сервера
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
      
      // Обрабатываем ответ - может быть массив или объект с data
      let recommendations = [];
      if (Array.isArray(data)) {
        recommendations = data;
      } else if (data?.data && Array.isArray(data.data)) {
        recommendations = data.data;
      } else if (data && typeof data === 'object') {
        // Если это один объект, оборачиваем в массив
        recommendations = [data];
      }
      
      // Нормализуем данные рекомендаций
      recommendations = recommendations.map((rec: any) => ({
        figi: rec.figi || rec.id,
        ticker: rec.ticker || '',
        name: rec.name || '',
        recommendation: rec.recommendation || rec.action || 'HOLD',
        confidence: rec.confidence || 0,
        score: rec.score || 0,
        analysis: rec.analysis || {},
        explanation: rec.explanation || rec.aiExplanation || {},
        priceAtAnalysis: rec.priceAtAnalysis || rec.price || 0,
        targetPrice: rec.targetPrice || rec.takeProfit,
        stopLoss: rec.stopLoss,
        takeProfit: rec.takeProfit || rec.targetPrice,
        analysisDate: rec.analysisDate || rec.createdAt || new Date().toISOString(),
        validUntil: rec.validUntil || rec.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        isActive: rec.isActive !== undefined ? rec.isActive : true,
        sector: rec.sector,
        tags: rec.tags || []
      }));
      
      setRecommendations(recommendations);
      
    } catch (error) {
      console.error('Error loading recommendations:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось загрузить рекомендации. Проверьте подключение к серверу.'
      });
      setRecommendations([]); // Устанавливаем пустой массив вместо моковых данных
    } finally {
      setLoading(false);
    }
  };

  const getRecommendationBadge = (recommendation: string) => {
    const config = {
      BUY: { severity: 'success' },
      SELL: { severity: 'danger' },
      HOLD: { severity: 'info' }
    };
    
    const rec = config[recommendation as keyof typeof config] || { severity: 'secondary' };
    return <Badge value={translateRecommendation(recommendation)} severity={rec.severity as any} />;
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
    setCurrentRecommendation(recommendation);
    setCreateOptions({
      stopLoss: recommendation.stopLoss,
      takeProfit: recommendation.targetPrice
    });
    setUserReason('');
    setShowCreateDialog(true);
  };

  const confirmCreateRequest = async () => {
    if (!currentRecommendation) return;
    
    try {
      // Отправляем как FIGI для поиска в БД, и данные рекомендации как fallback
      const optionsWithComment = {
        ...createOptions,
        comment: userReason ? `Причина отклонения AI-рекомендации: ${userReason}` : undefined
      };
      
      await apiService.createTradingRequest(
        currentRecommendation.figi,
        optionsWithComment,
        currentRecommendation as any // Передаем полные данные рекомендации
      );
      
      toast.current?.show({
        severity: 'success',
        summary: 'Заявка создана',
        detail: `Торговая заявка для ${currentRecommendation.ticker} создана успешно`
      });
      
      setShowCreateDialog(false);
      setCreateOptions({});
      setUserReason('');
      
      // Обновляем список рекомендаций после создания заявки
      await loadRecommendations();
      
    } catch (error: any) {
      console.error('Error creating trading request:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Не удалось создать торговую заявку';
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: errorMessage
      });
    }
  };

  const handleBulkCreateRequests = async () => {
    if (selectedRecommendations.length === 0) return;
    
    // Разрешаем создание заявок для всех рекомендаций, включая HOLD
    const validRecommendations = selectedRecommendations;
    
    if (validRecommendations.length === 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Предупреждение',
        detail: 'Нет выбранных рекомендаций для создания заявок'
      });
      return;
    }
    
    // Предупреждаем, если есть HOLD рекомендации
    const holdRecommendations = validRecommendations.filter(r => r.recommendation === 'HOLD');
    if (holdRecommendations.length > 0) {
      const holdTickers = holdRecommendations.map(r => r.ticker).join(', ');
      toast.current?.show({
        severity: 'warn',
        summary: 'Предупреждение',
        detail: `Создаются заявки для ${holdRecommendations.length} инструментов с рекомендацией HOLD: ${holdTickers}`,
        life: 5000
      });
    }
    
    confirmDialog({
      message: `Создать ${validRecommendations.length} торговых заявок?`,
      header: 'Массовое создание заявок',
      icon: 'pi pi-question-circle',
      accept: async () => {
        try {
          const figis = validRecommendations.map(r => r.figi);
          const result = await apiService.createBulkTradingRequests(figis, createOptions);
          
          const successCount = result?.requests?.length || 0;
          const errorCount = result?.errors?.length || 0;
          
          if (successCount > 0) {
            toast.current?.show({
              severity: 'success',
              summary: 'Заявки созданы',
              detail: `Создано ${successCount} заявок${errorCount > 0 ? `, ошибок: ${errorCount}` : ''}`
            });
          } else {
            toast.current?.show({
              severity: 'warn',
              summary: 'Предупреждение',
              detail: `Не удалось создать заявки. Ошибок: ${errorCount}`
            });
          }
          
          setSelectedRecommendations([]);
          
          // Обновляем список рекомендаций после создания заявок
          await loadRecommendations();
          
        } catch (error: any) {
          console.error('Error creating bulk requests:', error);
          const errorMessage = error?.response?.data?.message || error?.message || 'Не удалось создать заявки';
          toast.current?.show({
            severity: 'error',
            summary: 'Ошибка',
            detail: errorMessage
          });
        }
      }
    });
  };

  const actionBodyTemplate = (rowData: Recommendation) => {
    // Показываем кнопку для всех типов рекомендаций (BUY, SELL, HOLD)
    const buttonSeverity = rowData.recommendation === 'BUY' 
      ? 'success' 
      : rowData.recommendation === 'SELL'
      ? 'warning'
      : 'info'; // Для HOLD используем info цвет
    
    return (
      <Button
        label="Создать заявку"
        icon="pi pi-plus"
        size="small"
        severity={buttonSeverity}
        onClick={() => handleCreateRequest(rowData)}
        tooltip={rowData.recommendation === 'HOLD' 
          ? 'Создать заявку (AI рекомендует удержание)' 
          : 'Создать торговую заявку'}
        tooltipOptions={{ position: 'top' }}
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
            value={`${translateRecommendation('BUY')}: ${recommendations.filter(r => r.recommendation === 'BUY').length}`} 
            severity="success" 
          />
          <Badge 
            value={`${translateRecommendation('SELL')}: ${recommendations.filter(r => r.recommendation === 'SELL').length}`} 
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
        <div className="mb-3">
          {toolbarTemplate()}
        </div>
        
        {recommendations.length === 0 ? (
          <Message severity="info" text="Нет доступных рекомендаций" />
        ) : (
          <DataTable
            value={recommendations}
            selection={selectedRecommendations}
            onSelectionChange={(e) => setSelectedRecommendations(e.value as Recommendation[])}
            selectionMode="multiple"
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
              body={(rowData) => rowData.priceAtAnalysis ? formatCurrency(rowData.priceAtAnalysis) : 'N/A'}
            />
            
            <Column
              field="targetPrice"
              header="Целевая цена"
              sortable
              body={(rowData) => rowData.targetPrice ? formatCurrency(rowData.targetPrice) : 'N/A'}
            />
            
            <Column
              field="stopLoss"
              header="Stop Loss"
              sortable
              body={(rowData) => rowData.stopLoss ? formatCurrency(rowData.stopLoss) : 'N/A'}
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
        onHide={() => {
          setShowCreateDialog(false);
          setUserReason('');
        }}
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
            
            {currentRecommendation.recommendation === 'HOLD' && (
              <div className="mb-4 p-3 bg-yellow-50 border-round border-yellow-200 border-2">
                <div className="flex align-items-start gap-2">
                  <i className="pi pi-exclamation-triangle text-yellow-600 mt-1"></i>
                  <div className="flex-1">
                    <div className="font-bold text-yellow-800 mb-2">
                      ⚠️ Внимание: AI рекомендует HOLD
                    </div>
                    <div className="text-sm text-yellow-700 mb-2">
                      Вы создаете заявку, хотя AI рекомендует удержание позиции. 
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
            
            <div className="grid">
              <div className="col-6">
                <label htmlFor="quantity">Количество акций</label>
                <InputNumber
                  id="quantity"
                  value={createOptions.quantity}
                  onValueChange={(e) => setCreateOptions({...createOptions, quantity: e.value || undefined})}
                  min={1}
                  className="w-full"
                  placeholder="Оставьте пустым для автоматического расчета"
                  showButtons
                  buttonLayout="horizontal"
                  decrementButtonClassName="p-button-secondary"
                  incrementButtonClassName="p-button-secondary"
                  incrementButtonIcon="pi pi-plus"
                  decrementButtonIcon="pi pi-minus"
                />
                <small className="text-500">Если не указано, будет рассчитано автоматически</small>
              </div>
              
              <div className="col-6">
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
                <small className="text-500">Используется если количество не указано</small>
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
                onClick={() => {
                  setShowCreateDialog(false);
                  setUserReason('');
                }}
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
