import React, { useState, useEffect, useRef } from 'react';
import { Card } from 'primereact/card';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import { ProgressSpinner } from 'primereact/progressspinner';
import { TabView, TabPanel } from 'primereact/tabview';
import { apiService, InstrumentStat } from '../services/apiService';
import KellyCalculator from '../components/KellyCalculator';

const InstrumentStats: React.FC = () => {
  const [stats, setStats] = useState<InstrumentStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [globalFilter, setGlobalFilter] = useState('');
  const [sortField, setSortField] = useState('totalTrades');
  const [sortOrder, setSortOrder] = useState<-1 | 0 | 1>(-1);
  const [minTradesFilter, setMinTradesFilter] = useState<number>(0);
  const toast = useRef<Toast>(null);

  useEffect(() => {
    loadStats();
  }, [minTradesFilter, sortField, sortOrder]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const result = await apiService.getInstrumentStats({
        minTrades: minTradesFilter,
        sortBy: sortField,
        order: sortOrder === -1 ? 'DESC' : 'ASC',
        limit: 1000
      });
      setStats(result.data || []);
    } catch (error: any) {
      console.error('Error loading instrument stats:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось загрузить статистику инструментов'
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshStat = async (figi: string) => {
    try {
      await apiService.refreshInstrumentStat(figi);
      toast.current?.show({
        severity: 'success',
        summary: 'Успешно',
        detail: 'Статистика обновлена'
      });
      loadStats();
    } catch (error: any) {
      toast.current?.show({
        severity: 'error',
        summary: 'Ошибка',
        detail: 'Не удалось обновить статистику'
      });
    }
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '-';
    return `${(value * 100).toFixed(2)}%`;
  };

  const formatNumber = (value: number | null | undefined, decimals: number = 2) => {
    if (value === null || value === undefined) return '-';
    return value.toFixed(decimals);
  };

  const getWinRateSeverity = (winRate: number) => {
    if (winRate >= 0.6) return 'success';
    if (winRate >= 0.4) return 'warning';
    return 'danger';
  };

  const getKellySeverity = (kelly: number | null) => {
    if (kelly === null || kelly === undefined) return null;
    if (kelly >= 0.1) return 'success';
    if (kelly >= 0.05) return 'warning';
    return 'danger';
  };

  const winRateBodyTemplate = (rowData: InstrumentStat) => {
    return (
      <Tag value={formatPercent(rowData.winRate)} severity={getWinRateSeverity(rowData.winRate)} />
    );
  };

  const kellyBodyTemplate = (rowData: InstrumentStat) => {
    const kelly = rowData.kellyFraction;
    if (kelly === null || kelly === undefined) {
      return <span className="text-500">-</span>;
    }
    return (
      <Tag value={formatNumber(kelly, 3)} severity={getKellySeverity(kelly)} />
    );
  };

  const actionsBodyTemplate = (rowData: InstrumentStat) => {
    return (
      <Button
        icon="pi pi-refresh"
        className="p-button-text p-button-sm"
        onClick={() => refreshStat(rowData.figi)}
        tooltip="Обновить статистику"
      />
    );
  };

  const sortOptions = [
    { label: 'Количество сделок', value: 'totalTrades' },
    { label: 'Win Rate', value: 'winRate' },
    { label: 'Коэффициент Келли', value: 'kellyFraction' },
    { label: 'Средняя прибыль', value: 'averageWin' },
    { label: 'Волатильность', value: 'volatility' }
  ];

  return (
    <div className="p-4">
      <Toast ref={toast} />
      
      <TabView>
        <TabPanel header="📊 Статистика">
          <Card title="📊 Статистика по инструментам" className="mb-4">
        <div className="flex flex-column gap-3">
          <div className="flex gap-2 align-items-center">
            <span className="p-input-icon-left w-full">
              <i className="pi pi-search" />
              <InputText
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder="Поиск по тикеру или FIGI..."
                className="w-full"
              />
            </span>
          </div>
          
          <div className="flex gap-2 align-items-center">
            <label htmlFor="minTrades" className="text-sm">Мин. сделок:</label>
            <InputText
              id="minTrades"
              type="number"
              value={minTradesFilter}
              onChange={(e) => setMinTradesFilter(parseInt(e.target.value) || 0)}
              className="w-6rem"
            />
            
            <label htmlFor="sortBy" className="text-sm ml-3">Сортировка:</label>
            <Dropdown
              id="sortBy"
              value={sortField}
              options={sortOptions}
              onChange={(e) => setSortField(e.value)}
              className="w-12rem"
            />
            
            <Button
              icon={sortOrder === -1 ? 'pi pi-sort-down' : 'pi pi-sort-up'}
              onClick={() => setSortOrder(sortOrder === -1 ? 1 : -1)}
              className="p-button-text"
              tooltip="Изменить порядок сортировки"
            />
            
            <Button
              icon="pi pi-refresh"
              label="Обновить"
              onClick={loadStats}
              loading={loading}
              className="ml-auto"
            />
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="flex justify-content-center align-items-center" style={{ minHeight: '200px' }}>
            <ProgressSpinner />
          </div>
        ) : (
          <DataTable
            value={stats}
            globalFilter={globalFilter}
            sortField={sortField}
            sortOrder={sortOrder}
            paginator
            rows={20}
            rowsPerPageOptions={[10, 20, 50, 100]}
            emptyMessage="Нет данных о статистике инструментов"
            className="p-datatable-sm"
          >
            <Column
              field="ticker"
              header="Тикер"
              sortable
              style={{ minWidth: '100px' }}
            />
            <Column
              field="figi"
              header="FIGI"
              sortable
              style={{ minWidth: '150px' }}
            />
            <Column
              field="winRate"
              header="Win Rate"
              sortable
              body={winRateBodyTemplate}
              style={{ minWidth: '120px' }}
            />
            <Column
              field="totalTrades"
              header="Сделок"
              sortable
              style={{ minWidth: '100px' }}
            />
            <Column
              field="profitableTrades"
              header="Прибыльных"
              sortable
              style={{ minWidth: '120px' }}
            />
            <Column
              field="losingTrades"
              header="Убыточных"
              sortable
              style={{ minWidth: '120px' }}
            />
            <Column
              field="averageWin"
              header="Ср. прибыль"
              sortable
              body={(row) => formatPercent(row.averageWin)}
              style={{ minWidth: '120px' }}
            />
            <Column
              field="averageLoss"
              header="Ср. убыток"
              sortable
              body={(row) => formatPercent(row.averageLoss)}
              style={{ minWidth: '120px' }}
            />
            <Column
              field="kellyFraction"
              header="Келли"
              sortable
              body={kellyBodyTemplate}
              style={{ minWidth: '100px' }}
            />
            <Column
              field="volatility"
              header="Волатильность"
              sortable
              body={(row) => formatPercent(row.volatility)}
              style={{ minWidth: '130px' }}
            />
            <Column
              field="lastUpdated"
              header="Обновлено"
              sortable
              body={(row) => new Date(row.lastUpdated).toLocaleString('ru-RU')}
              style={{ minWidth: '150px' }}
            />
            <Column
              body={actionsBodyTemplate}
              header="Действия"
              style={{ width: '100px' }}
            />
          </DataTable>
        )}
      </Card>
        </TabPanel>
        
        <TabPanel header="🧮 Калькулятор Келли">
          <KellyCalculator />
        </TabPanel>
      </TabView>
    </div>
  );
};

export default InstrumentStats;

