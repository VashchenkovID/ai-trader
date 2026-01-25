import React, { useState } from 'react';
import { Card } from '../ui/Card/Card';
import { Button } from '../ui/Button/Button';
import { Select } from '../ui/Select/Select';
import { ProgressBar } from '../ui/ProgressBar/ProgressBar';
import { performanceApi } from '../../services/performanceApi';
import './ReportExport.css';

interface ReportExportProps {
  className?: string;
}

type ReportType = 'daily' | 'weekly' | 'monthly';
type ReportFormat = 'pdf' | 'excel';

export const ReportExport: React.FC<ReportExportProps> = ({ className = '' }) => {
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [reportFormat, setReportFormat] = useState<ReportFormat>('pdf');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reportTypeOptions = [
    { value: 'daily', label: 'Ежедневный' },
    { value: 'weekly', label: 'Еженедельный' },
    { value: 'monthly', label: 'Месячный' },
  ];

  const reportFormatOptions = [
    { value: 'pdf', label: 'PDF' },
    { value: 'excel', label: 'Excel' },
  ];

  const generateReport = async () => {
    setGenerating(true);
    setProgress(0);
    setError(null);
    setDownloadUrl(null);

    try {
      // Симуляция прогресса
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      let result;
      
      if (reportFormat === 'pdf') {
        switch (reportType) {
          case 'daily':
            result = await performanceApi.generateDailyReportPDF();
            break;
          case 'weekly':
            result = await performanceApi.generateWeeklyReportPDF();
            break;
          case 'monthly':
            result = await performanceApi.generateMonthlyReportPDF();
            break;
        }
      } else {
        const days = reportType === 'daily' ? 1 : reportType === 'weekly' ? 7 : 30;
        result = await performanceApi.generateExcelReport(reportType, days);
      }

      clearInterval(progressInterval);
      setProgress(100);

      // Формируем URL для скачивания
      const API_BASE_URL = (window as any).env?.REACT_APP_API_URL || 'http://localhost:3001';
      const url = result.downloadUrl || `${API_BASE_URL}${result.filepath}`;
      setDownloadUrl(url);

      // Автоматическое скачивание
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = url;
        link.download = url.split('/').pop() || 'report';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, 500);
    } catch (err: any) {
      console.error('Error generating report:', err);
      setError(err.message || 'Ошибка генерации отчета');
      setProgress(0);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card variant="glass" className={`report-export ${className}`}>
      <div className="report-export-header">
        <h3 className="report-export-title">Экспорт отчетов</h3>
      </div>

      <div className="report-export-content">
        <div className="report-export-controls">
          <div className="control-group">
            <label className="control-label">Тип отчета</label>
            <Select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              options={reportTypeOptions}
              size="md"
            />
          </div>

          <div className="control-group">
            <label className="control-label">Формат</label>
            <Select
              value={reportFormat}
              onChange={(e) => setReportFormat(e.target.value as ReportFormat)}
              options={reportFormatOptions}
              size="md"
            />
          </div>
        </div>

        {generating && (
          <div className="report-export-progress">
            <ProgressBar value={progress} />
            <span className="progress-text">{progress}%</span>
          </div>
        )}

        {error && (
          <div className="report-export-error">
            <p>{error}</p>
          </div>
        )}

        {downloadUrl && !generating && (
          <div className="report-export-success">
            <p>Отчет успешно сгенерирован!</p>
            <Button
              variant="primary"
              onClick={() => {
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = downloadUrl.split('/').pop() || 'report';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
            >
              Скачать отчет
            </Button>
          </div>
        )}

        <div className="report-export-actions">
          <Button
            variant="primary"
            onClick={generateReport}
            loading={generating}
            disabled={generating}
            fullWidth
          >
            {generating ? 'Генерация...' : 'Сгенерировать отчет'}
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default ReportExport;

