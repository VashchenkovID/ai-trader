import React from 'react';
import { Card } from 'primereact/card';
import { ProgressBar } from 'primereact/progressbar';
import { Tag } from 'primereact/tag';
import { Badge } from 'primereact/badge';

interface Setting {
  key: string;
  value: any;
  description: string;
  category: string;
  dataType: string;
  isEditable: boolean;
  minValue?: number;
  maxValue?: number;
  options?: any[];
  lastUpdated: string;
}

interface SettingsStatsProps {
  settings: Setting[];
  originalSettings: Setting[];
}

const SettingsStats: React.FC<SettingsStatsProps> = ({ settings, originalSettings }) => {
  // Подсчет статистики
  const totalSettings = settings.length;
  const editableSettings = settings.filter(s => s.isEditable).length;
  const readOnlySettings = totalSettings - editableSettings;
  
  const changedSettings = settings.filter(setting => {
    const original = originalSettings.find(orig => orig.key === setting.key);
    return original && JSON.stringify(original.value) !== JSON.stringify(setting.value);
  }).length;

  const unchangedSettings = totalSettings - changedSettings;

  // Группировка по типам данных
  const dataTypeStats = settings.reduce((acc, setting) => {
    acc[setting.dataType] = (acc[setting.dataType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Группировка по категориям
  const categoryStats = settings.reduce((acc, setting) => {
    const category = setting.category || 'Общие';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Последние обновления
  const recentUpdates = settings
    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
    .slice(0, 5);

  const getSeverity = (count: number, total: number) => {
    const percentage = (count / total) * 100;
    if (percentage >= 80) return 'success';
    if (percentage >= 60) return 'info';
    if (percentage >= 40) return 'warning';
    return 'danger';
  };

  return (
    <div className="grid">
      {/* Общая статистика */}
      <div className="col-12 md:col-6 lg:col-3">
        <Card className="text-center">
          <div className="flex flex-column align-items-center gap-2">
            <i className="pi pi-cog text-4xl text-blue-500"></i>
            <h3 className="text-2xl font-bold m-0">{totalSettings}</h3>
            <p className="text-sm text-gray-600 m-0">Всего настроек</p>
            <ProgressBar 
              value={100} 
              showValue={false} 
              className="w-full"
              color="blue"
            />
          </div>
        </Card>
      </div>

      {/* Редактируемые настройки */}
      <div className="col-12 md:col-6 lg:col-3">
        <Card className="text-center">
          <div className="flex flex-column align-items-center gap-2">
            <i className="pi pi-pencil text-4xl text-green-500"></i>
            <h3 className="text-2xl font-bold m-0">{editableSettings}</h3>
            <p className="text-sm text-gray-600 m-0">Редактируемые</p>
            <ProgressBar 
              value={(editableSettings / totalSettings) * 100} 
              showValue={false} 
              className="w-full"
              color="green"
            />
          </div>
        </Card>
      </div>

      {/* Только для чтения */}
      <div className="col-12 md:col-6 lg:col-3">
        <Card className="text-center">
          <div className="flex flex-column align-items-center gap-2">
            <i className="pi pi-lock text-4xl text-orange-500"></i>
            <h3 className="text-2xl font-bold m-0">{readOnlySettings}</h3>
            <p className="text-sm text-gray-600 m-0">Только чтение</p>
            <ProgressBar 
              value={(readOnlySettings / totalSettings) * 100} 
              showValue={false} 
              className="w-full"
              color="orange"
            />
          </div>
        </Card>
      </div>

      {/* Измененные настройки */}
      <div className="col-12 md:col-6 lg:col-3">
        <Card className="text-center">
          <div className="flex flex-column align-items-center gap-2">
            <i className="pi pi-exclamation-triangle text-4xl text-yellow-500"></i>
            <h3 className="text-2xl font-bold m-0">{changedSettings}</h3>
            <p className="text-sm text-gray-600 m-0">Изменено</p>
            <ProgressBar 
              value={(changedSettings / totalSettings) * 100} 
              showValue={false} 
              className="w-full"
              color="yellow"
            />
          </div>
        </Card>
      </div>

      {/* Статистика по типам данных */}
      <div className="col-12 md:col-6">
        <Card>
          <h4 className="text-lg font-semibold mb-3">Типы данных</h4>
          <div className="flex flex-column gap-2">
            {Object.entries(dataTypeStats).map(([type, count]) => (
              <div key={type} className="flex justify-content-between align-items-center">
                <div className="flex align-items-center gap-2">
                  <Tag 
                    value={type} 
                    severity={getSeverity(count, totalSettings)}
                    className="text-xs"
                  />
                  <span className="text-sm">{type}</span>
                </div>
                <Badge value={count} severity="info" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Статистика по категориям */}
      <div className="col-12 md:col-6">
        <Card>
          <h4 className="text-lg font-semibold mb-3">Категории</h4>
          <div className="flex flex-column gap-2">
            {Object.entries(categoryStats)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 8)
              .map(([category, count]) => (
                <div key={category} className="flex justify-content-between align-items-center">
                  <div className="flex align-items-center gap-2">
                    <i className="pi pi-folder text-xs text-gray-500"></i>
                    <span className="text-sm">{category}</span>
                  </div>
                  <Badge value={count} severity="secondary" />
                </div>
              ))}
          </div>
        </Card>
      </div>

      {/* Последние обновления */}
      <div className="col-12">
        <Card>
          <h4 className="text-lg font-semibold mb-3">Последние обновления</h4>
          <div className="flex flex-column gap-2">
            {recentUpdates.map((setting) => (
              <div key={setting.key} className="flex justify-content-between align-items-center p-2 border-round surface-100">
                <div className="flex align-items-center gap-2">
                  <i className="pi pi-cog text-xs text-gray-500"></i>
                  <span className="text-sm font-medium">
                    {setting.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                  <Tag 
                    value={setting.dataType} 
                    severity="info" 
                    className="text-xs"
                  />
                </div>
                <div className="flex align-items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {new Date(setting.lastUpdated).toLocaleString('ru-RU')}
                  </span>
                  {!setting.isEditable && (
                    <i className="pi pi-lock text-xs text-gray-400"></i>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default SettingsStats;
