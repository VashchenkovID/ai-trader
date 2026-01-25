// Import pdfkit and exceljs - will be mocked in tests
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

import PerformanceAnalyzer from './PerformanceAnalyzer.js';
import PerformanceVisualizationService from './PerformanceVisualizationService.js';
import BenchmarkService from './BenchmarkService.js';
import LoggerService from './LoggerService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Сервис для экспорта отчетов в PDF и Excel
 * Фаза 4.3.4: Экспорт отчетов в PDF/Excel
 */
class ReportExportService {
    constructor() {
        this.isInitialized = false;
        this.reportsDir = path.join(__dirname, '../../reports');
        this.ensureReportsDirectory();
    }

    async initialize() {
        if (this.isInitialized) return;
        LoggerService.info('📄 Initializing ReportExportService...');
        this.isInitialized = true;
        LoggerService.info('✅ ReportExportService initialized');
    }

    /**
     * Создание директории для отчетов
     * @private
     */
    ensureReportsDirectory() {
        if (!fs.existsSync(this.reportsDir)) {
            fs.mkdirSync(this.reportsDir, { recursive: true });
        }
    }

    /**
     * Генерация ежедневного отчета в PDF
     * @param {Date} date - Дата отчета
     * @returns {Promise<string>} Путь к файлу
     */
    async generateDailyReportPDF(date = new Date()) {
        try {
            const analysis = await PerformanceAnalyzer.analyzePerformance('short', 1);
            const dateStr = date.toISOString().split('T')[0];
            const filename = `daily_report_${dateStr}.pdf`;
            const filepath = path.join(this.reportsDir, filename);

            const doc = new PDFDocument({ margin: 50 });
            const stream = fs.createWriteStream(filepath);
            doc.pipe(stream);

            // Заголовок
            doc.fontSize(20).text('Ежедневный отчет о производительности', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Дата: ${dateStr}`, { align: 'center' });
            doc.moveDown(2);

            // Сводка
            doc.fontSize(16).text('Сводка', { underline: true });
            doc.moveDown();
            doc.fontSize(12);
            
            if (analysis.summary) {
                doc.text(`Общий рейтинг: ${analysis.summary.overallRating || 'N/A'}`);
                if (analysis.summary.keyMetrics) {
                    doc.text(`Прибыль: ${analysis.summary.keyMetrics.profit?.toFixed(2) || 0} руб.`);
                    doc.text(`Win Rate: ${((analysis.summary.keyMetrics.winRate || 0) * 100).toFixed(1)}%`);
                    doc.text(`Сделок: ${analysis.summary.keyMetrics.trades || 0}`);
                }
            }
            doc.moveDown();

            // Торговые результаты
            if (analysis.trading) {
                doc.fontSize(16).text('Торговые результаты', { underline: true });
                doc.moveDown();
                doc.fontSize(12);
                doc.text(`Общая прибыль: ${analysis.trading.totalProfit?.toFixed(2) || 0} руб.`);
                doc.text(`Всего сделок: ${analysis.trading.totalTrades || 0}`);
                doc.text(`Прибыльных сделок: ${analysis.trading.profitableTrades || 0}`);
                doc.text(`Win Rate: ${((analysis.trading.winRate || 0) * 100).toFixed(1)}%`);
                doc.text(`Волатильность: ${((analysis.trading.volatility || 0) * 100).toFixed(2)}%`);
                doc.text(`Максимальная просадка: ${((analysis.trading.maxDrawdown || 0) * 100).toFixed(2)}%`);
                doc.moveDown();
            }

            // Рекомендации
            if (analysis.recommendations && analysis.recommendations.length > 0) {
                doc.fontSize(16).text('Рекомендации', { underline: true });
                doc.moveDown();
                doc.fontSize(12);
                analysis.recommendations.slice(0, 5).forEach(rec => {
                    doc.text(`• ${rec.message}`, { indent: 20 });
                });
                doc.moveDown();
            }

            // Алерты
            if (analysis.alerts && analysis.alerts.length > 0) {
                doc.fontSize(16).text('Алерты', { underline: true });
                doc.moveDown();
                doc.fontSize(12);
                analysis.alerts.forEach(alert => {
                    doc.text(`⚠️ ${alert.message}`, { indent: 20 });
                });
            }

            doc.end();

            return new Promise((resolve, reject) => {
                stream.on('finish', () => resolve(filepath));
                stream.on('error', reject);
            });
        } catch (error) {
            LoggerService.error('Error generating daily report PDF', {
                service: 'ReportExportService',
                error: { message: error.message }
            });
            throw error;
        }
    }

    /**
     * Генерация еженедельного отчета в PDF
     * @param {Date} weekEndDate - Конец недели
     * @returns {Promise<string>} Путь к файлу
     */
    async generateWeeklyReportPDF(weekEndDate = new Date()) {
        try {
            const analysis = await PerformanceAnalyzer.analyzePerformance('medium', 7);
            const visualization = await PerformanceVisualizationService.getDashboardData({ period: 7 });
            const dateStr = weekEndDate.toISOString().split('T')[0];
            const filename = `weekly_report_${dateStr}.pdf`;
            const filepath = path.join(this.reportsDir, filename);

            const doc = new PDFDocument({ margin: 50 });
            const stream = fs.createWriteStream(filepath);
            doc.pipe(stream);

            // Заголовок
            doc.fontSize(20).text('Еженедельный отчет о производительности', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Период: ${dateStr} (7 дней)`, { align: 'center' });
            doc.moveDown(2);

            // Добавляем содержимое из ежедневного отчета
            await this.addAnalysisContent(doc, analysis);

            // Секторный анализ
            const sectorAnalysis = await PerformanceAnalyzer.analyzeSectorPerformance(7);
            if (sectorAnalysis.sectors) {
                doc.addPage();
                doc.fontSize(16).text('Анализ по секторам', { underline: true });
                doc.moveDown();
                doc.fontSize(12);
                
                Object.values(sectorAnalysis.sectors).forEach(sector => {
                    doc.text(`${sector.sector}:`, { underline: true });
                    doc.text(`  Инструментов: ${sector.instruments}`);
                    doc.text(`  Сделок: ${sector.trades}`);
                    doc.text(`  Прибыль: ${sector.profit?.toFixed(2) || 0} руб.`);
                    doc.text(`  Win Rate: ${(sector.winRate * 100).toFixed(1)}%`);
                    doc.text(`  Sharpe Ratio: ${sector.sharpeRatio?.toFixed(2) || 0}`);
                    doc.text(`  Доля портфеля: ${(sector.portfolioWeight * 100).toFixed(1)}%`);
                    doc.moveDown();
                });
            }

            doc.end();

            return new Promise((resolve, reject) => {
                stream.on('finish', () => resolve(filepath));
                stream.on('error', reject);
            });
        } catch (error) {
            LoggerService.error('Error generating weekly report PDF', {
                service: 'ReportExportService',
                error: { message: error.message }
            });
            throw error;
        }
    }

    /**
     * Генерация месячного отчета в PDF
     * @param {Date} monthEndDate - Конец месяца
     * @returns {Promise<string>} Путь к файлу
     */
    async generateMonthlyReportPDF(monthEndDate = new Date()) {
        try {
            const analysis = await PerformanceAnalyzer.analyzePerformance('long', 30);
            const sectorAnalysis = await PerformanceAnalyzer.analyzeSectorPerformance(30);
            const benchmarkComparison = await BenchmarkService.compareWithBenchmark('IMOEX', 30);
            const dateStr = monthEndDate.toISOString().split('T')[0];
            const filename = `monthly_report_${dateStr}.pdf`;
            const filepath = path.join(this.reportsDir, filename);

            const doc = new PDFDocument({ margin: 50 });
            const stream = fs.createWriteStream(filepath);
            doc.pipe(stream);

            // Заголовок
            doc.fontSize(20).text('Месячный отчет о производительности', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Период: ${dateStr} (30 дней)`, { align: 'center' });
            doc.moveDown(2);

            // Полный анализ
            await this.addAnalysisContent(doc, analysis);

            // Секторный анализ
            doc.addPage();
            await this.addSectorAnalysisContent(doc, sectorAnalysis);

            // Сравнение с бенчмарком
            if (benchmarkComparison && !benchmarkComparison.error) {
                doc.addPage();
                await this.addBenchmarkComparisonContent(doc, benchmarkComparison);
            }

            doc.end();

            return new Promise((resolve, reject) => {
                stream.on('finish', () => resolve(filepath));
                stream.on('error', reject);
            });
        } catch (error) {
            LoggerService.error('Error generating monthly report PDF', {
                service: 'ReportExportService',
                error: { message: error.message }
            });
            throw error;
        }
    }

    /**
     * Добавление контента анализа в PDF
     * @private
     */
    async addAnalysisContent(doc, analysis) {
        doc.fontSize(16).text('Сводка', { underline: true });
        doc.moveDown();
        doc.fontSize(12);
        
        if (analysis.summary) {
            doc.text(`Общий рейтинг: ${analysis.summary.overallRating || 'N/A'}`);
            if (analysis.summary.keyMetrics) {
                doc.text(`Прибыль: ${analysis.summary.keyMetrics.profit?.toFixed(2) || 0} руб.`);
                doc.text(`Win Rate: ${((analysis.summary.keyMetrics.winRate || 0) * 100).toFixed(1)}%`);
            }
        }
        doc.moveDown();

        if (analysis.trading) {
            doc.fontSize(16).text('Торговые результаты', { underline: true });
            doc.moveDown();
            doc.fontSize(12);
            doc.text(`Общая прибыль: ${analysis.trading.totalProfit?.toFixed(2) || 0} руб.`);
            doc.text(`Всего сделок: ${analysis.trading.totalTrades || 0}`);
            doc.text(`Win Rate: ${((analysis.trading.winRate || 0) * 100).toFixed(1)}%`);
            doc.moveDown();
        }
    }

    /**
     * Добавление секторного анализа в PDF
     * @private
     */
    async addSectorAnalysisContent(doc, sectorAnalysis) {
        doc.fontSize(16).text('Анализ по секторам', { underline: true });
        doc.moveDown();
        doc.fontSize(12);
        
        if (sectorAnalysis.sectors) {
            Object.values(sectorAnalysis.sectors).forEach(sector => {
                doc.text(`${sector.sector}:`, { underline: true });
                doc.text(`  Прибыль: ${sector.profit?.toFixed(2) || 0} руб.`);
                doc.text(`  Win Rate: ${(sector.winRate * 100).toFixed(1)}%`);
                doc.text(`  Sharpe Ratio: ${sector.sharpeRatio?.toFixed(2) || 0}`);
                doc.text(`  Доля портфеля: ${(sector.portfolioWeight * 100).toFixed(1)}%`);
                doc.moveDown();
            });
        }
    }

    /**
     * Добавление сравнения с бенчмарком в PDF
     * @private
     */
    async addBenchmarkComparisonContent(doc, comparison) {
        doc.fontSize(16).text('Сравнение с бенчмарком', { underline: true });
        doc.moveDown();
        doc.fontSize(12);
        
        doc.text(`Бенчмарк: ${comparison.benchmark.name}`);
        doc.text(`Alpha: ${(comparison.comparison.alpha * 100).toFixed(2)}%`);
        doc.text(`Beta: ${comparison.comparison.beta.toFixed(2)}`);
        doc.text(`Tracking Error: ${(comparison.comparison.trackingError * 100).toFixed(2)}%`);
        doc.text(`Information Ratio: ${comparison.comparison.informationRatio.toFixed(2)}`);
        doc.moveDown();
        
        if (comparison.alerts && comparison.alerts.length > 0) {
            doc.text('Алерты:', { underline: true });
            comparison.alerts.forEach(alert => {
                doc.text(`⚠️ ${alert.message}`, { indent: 20 });
            });
        }
    }

    /**
     * Генерация отчета в Excel
     * @param {string} reportType - Тип отчета (daily, weekly, monthly)
     * @param {number} days - Период в днях
     * @returns {Promise<string>} Путь к файлу
     */
    async generateExcelReport(reportType = 'monthly', days = 30) {
        try {
            const analysis = await PerformanceAnalyzer.analyzePerformance('medium', days);
            const sectorAnalysis = await PerformanceAnalyzer.analyzeSectorPerformance(days);
            const dateStr = new Date().toISOString().split('T')[0];
            const filename = `${reportType}_report_${dateStr}.xlsx`;
            const filepath = path.join(this.reportsDir, filename);

            const workbook = new ExcelJS.Workbook();
            
            // Лист "Сводка"
            const summarySheet = workbook.addWorksheet('Сводка');
            summarySheet.columns = [
                { header: 'Метрика', key: 'metric', width: 30 },
                { header: 'Значение', key: 'value', width: 20 }
            ];

            if (analysis.summary && analysis.summary.keyMetrics) {
                summarySheet.addRow({ metric: 'Общий рейтинг', value: analysis.summary.overallRating || 'N/A' });
                summarySheet.addRow({ metric: 'Прибыль', value: analysis.summary.keyMetrics.profit?.toFixed(2) || 0 });
                summarySheet.addRow({ metric: 'Win Rate', value: `${((analysis.summary.keyMetrics.winRate || 0) * 100).toFixed(1)}%` });
                summarySheet.addRow({ metric: 'Сделок', value: analysis.summary.keyMetrics.trades || 0 });
            }

            // Лист "Торговля"
            if (analysis.trading) {
                const tradingSheet = workbook.addWorksheet('Торговля');
                tradingSheet.columns = [
                    { header: 'Метрика', key: 'metric', width: 30 },
                    { header: 'Значение', key: 'value', width: 20 }
                ];

                tradingSheet.addRow({ metric: 'Общая прибыль', value: analysis.trading.totalProfit?.toFixed(2) || 0 });
                tradingSheet.addRow({ metric: 'Всего сделок', value: analysis.trading.totalTrades || 0 });
                tradingSheet.addRow({ metric: 'Прибыльных сделок', value: analysis.trading.profitableTrades || 0 });
                tradingSheet.addRow({ metric: 'Win Rate', value: `${((analysis.trading.winRate || 0) * 100).toFixed(1)}%` });
                tradingSheet.addRow({ metric: 'Волатильность', value: `${((analysis.trading.volatility || 0) * 100).toFixed(2)}%` });
                tradingSheet.addRow({ metric: 'Максимальная просадка', value: `${((analysis.trading.maxDrawdown || 0) * 100).toFixed(2)}%` });
            }

            // Лист "Секторы"
            if (sectorAnalysis.sectors) {
                const sectorSheet = workbook.addWorksheet('Секторы');
                sectorSheet.columns = [
                    { header: 'Сектор', key: 'sector', width: 20 },
                    { header: 'Инструментов', key: 'instruments', width: 15 },
                    { header: 'Сделок', key: 'trades', width: 15 },
                    { header: 'Прибыль', key: 'profit', width: 15 },
                    { header: 'Win Rate', key: 'winRate', width: 15 },
                    { header: 'Sharpe Ratio', key: 'sharpeRatio', width: 15 },
                    { header: 'Доля портфеля', key: 'portfolioWeight', width: 15 }
                ];

                Object.values(sectorAnalysis.sectors).forEach(sector => {
                    sectorSheet.addRow({
                        sector: sector.sector,
                        instruments: sector.instruments,
                        trades: sector.trades,
                        profit: sector.profit?.toFixed(2) || 0,
                        winRate: `${(sector.winRate * 100).toFixed(1)}%`,
                        sharpeRatio: sector.sharpeRatio?.toFixed(2) || 0,
                        portfolioWeight: `${(sector.portfolioWeight * 100).toFixed(1)}%`
                    });
                });
            }

            await workbook.xlsx.writeFile(filepath);
            return filepath;
        } catch (error) {
            LoggerService.error('Error generating Excel report', {
                service: 'ReportExportService',
                error: { message: error.message }
            });
            throw error;
        }
    }
}

export default new ReportExportService();

