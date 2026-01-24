import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock pdfkit and exceljs BEFORE importing ReportExportService
// Create a constructor function for PDFDocument that works with dynamic imports
const MockPDFDocument = jest.fn().mockImplementation(function() {
    this.fontSize = jest.fn().mockReturnThis();
    this.text = jest.fn().mockReturnThis();
    this.moveDown = jest.fn().mockReturnThis();
    this.addPage = jest.fn().mockReturnThis();
    this.pipe = jest.fn().mockReturnThis();
    this.end = jest.fn();
    return this;
});

// Create a constructor function for ExcelJS Workbook
const MockWorkbook = jest.fn().mockImplementation(function() {
    this.addWorksheet = jest.fn().mockReturnValue({
        columns: [],
        addRow: jest.fn()
    });
    this.xlsx = {
        writeFile: jest.fn().mockResolvedValue(undefined)
    };
    return this;
});

const mockExcelJS = {
    Workbook: MockWorkbook
};

// Mock modules for static imports
jest.mock('pdfkit', () => {
    const mock = jest.fn().mockImplementation(function() {
        this.fontSize = jest.fn().mockReturnThis();
        this.text = jest.fn().mockReturnThis();
        this.moveDown = jest.fn().mockReturnThis();
        this.addPage = jest.fn().mockReturnThis();
        this.pipe = jest.fn(function(dest) {
            // pipe должен возвращать destination stream
            return dest;
        });
        this.end = jest.fn();
        return this;
    });
    return {
        __esModule: true,
        default: mock
    };
});

jest.mock('exceljs', () => {
    const MockWorkbook = jest.fn().mockImplementation(function() {
        this.addWorksheet = jest.fn().mockReturnValue({
            columns: [],
            addRow: jest.fn()
        });
        this.xlsx = {
            writeFile: jest.fn().mockResolvedValue(undefined)
        };
        return this;
    });
    return {
        __esModule: true,
        default: {
            Workbook: MockWorkbook
        }
    };
});

jest.mock('../../services/PerformanceAnalyzer.js');
jest.mock('../../services/PerformanceVisualizationService.js');
jest.mock('../../services/BenchmarkService.js');
jest.mock('fs');
jest.mock('../../services/LoggerService.js', () => ({
    default: {
        isInitialized: true,
        error: jest.fn(),
        log: jest.fn()
    }
}));

// Import after mocks
import ReportExportService from '../../services/ReportExportService.js';
import PerformanceAnalyzer from '../../services/PerformanceAnalyzer.js';
import PerformanceVisualizationService from '../../services/PerformanceVisualizationService.js';
import BenchmarkService from '../../services/BenchmarkService.js';
import fs from 'fs';
import path from 'path';

describe('ReportExportService (Phase 4.3.4)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('generateDailyReportPDF', () => {
        it('should generate daily report PDF', async () => {
            PerformanceAnalyzer.analyzePerformance = jest.fn().mockResolvedValue({
                summary: {
                    overallRating: 'good',
                    keyMetrics: {
                        profit: 1000,
                        winRate: 0.6,
                        trades: 10
                    }
                },
                trading: {
                    totalProfit: 1000,
                    totalTrades: 10,
                    profitableTrades: 6,
                    winRate: 0.6,
                    volatility: 0.05,
                    maxDrawdown: 0.1
                },
                recommendations: [
                    { message: 'Test recommendation' }
                ],
                alerts: [
                    { message: 'Test alert' }
                ]
            });

            // Mock stream - должен иметь все методы для pipe (EventEmitter interface)
            const mockStream = {
                on: jest.fn((event, callback) => {
                    if (event === 'finish') {
                        setTimeout(callback, 0);
                    }
                    return mockStream;
                }),
                once: jest.fn((event, callback) => {
                    if (event === 'finish') {
                        setTimeout(callback, 0);
                    }
                    return mockStream;
                }),
                emit: jest.fn((event, ...args) => {
                    return mockStream;
                }),
                removeListener: jest.fn((event, callback) => {
                    return mockStream;
                }),
                removeAllListeners: jest.fn((event) => {
                    return mockStream;
                }),
                write: jest.fn(),
                end: jest.fn()
            };

            fs.createWriteStream = jest.fn().mockReturnValue(mockStream);
            fs.existsSync = jest.fn().mockReturnValue(true);
            fs.mkdirSync = jest.fn();

            const filepath = await ReportExportService.generateDailyReportPDF();

            expect(filepath).toBeDefined();
            expect(PerformanceAnalyzer.analyzePerformance).toHaveBeenCalled();
        });
    });

    describe('generateExcelReport', () => {
        it('should generate Excel report', async () => {
            PerformanceAnalyzer.analyzePerformance = jest.fn().mockResolvedValue({
                summary: {
                    overallRating: 'good',
                    keyMetrics: {
                        profit: 1000,
                        winRate: 0.6,
                        trades: 10
                    }
                },
                trading: {
                    totalProfit: 1000,
                    totalTrades: 10,
                    profitableTrades: 6,
                    winRate: 0.6,
                    volatility: 0.05,
                    maxDrawdown: 0.1
                }
            });

            PerformanceAnalyzer.analyzeSectorPerformance = jest.fn().mockResolvedValue({
                sectors: {
                    technology: {
                        sector: 'technology',
                        instruments: 5,
                        trades: 10,
                        profit: 500,
                        winRate: 0.7,
                        sharpeRatio: 1.2,
                        portfolioWeight: 0.3
                    }
                }
            });

            fs.existsSync = jest.fn().mockReturnValue(true);
            fs.mkdirSync = jest.fn();

            const filepath = await ReportExportService.generateExcelReport('monthly', 30);

            expect(filepath).toBeDefined();
            expect(PerformanceAnalyzer.analyzePerformance).toHaveBeenCalled();
            expect(PerformanceAnalyzer.analyzeSectorPerformance).toHaveBeenCalled();
        });
    });
});
