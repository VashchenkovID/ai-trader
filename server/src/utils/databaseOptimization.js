/**
 * Утилиты для оптимизации базы данных
 * - Анализ индексов
 * - Создание недостающих индексов
 * - Анализ медленных запросов
 */

import sequelize from '../config/database.js';
import LoggerService from '../services/LoggerService.js';

class DatabaseOptimization {
    constructor() {
        this.sequelize = sequelize;
    }
    
    /**
     * Анализ текущих индексов в базе данных
     */
    async analyzeIndexes() {
        try {
            const queryInterface = this.sequelize.getQueryInterface();
            const tables = await this.sequelize.query(
                `SELECT table_name 
                 FROM information_schema.tables 
                 WHERE table_schema = 'public' 
                 AND table_type = 'BASE TABLE'
                 ORDER BY table_name`,
                { type: this.sequelize.QueryTypes.SELECT }
            );
            
            const indexAnalysis = {};
            
            for (const table of tables) {
                const tableName = table.table_name;
                const indexes = await this.sequelize.query(
                    `SELECT 
                        indexname, 
                        indexdef 
                     FROM pg_indexes 
                     WHERE schemaname = 'public' 
                     AND tablename = '${tableName}'
                     ORDER BY indexname`,
                    { type: this.sequelize.QueryTypes.SELECT }
                );
                
                indexAnalysis[tableName] = {
                    indexes: indexes.map(idx => ({
                        name: idx.indexname,
                        definition: idx.indexdef
                    })),
                    count: indexes.length
                };
            }
            
            return indexAnalysis;
        } catch (error) {
            LoggerService.error('Ошибка анализа индексов', {
                service: 'DatabaseOptimization',
                operation: 'analyzeIndexes',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
    
    /**
     * Рекомендуемые индексы для оптимизации
     */
    getRecommendedIndexes() {
        return {
            trading_requests: [
                {
                    name: 'idx_trading_requests_figi',
                    fields: ['figi'],
                    description: 'Индекс для поиска заявок по FIGI'
                },
                {
                    name: 'idx_trading_requests_action_status',
                    fields: ['action', 'status'],
                    description: 'Составной индекс для фильтрации по действию и статусу'
                },
                {
                    name: 'idx_trading_requests_executed_at',
                    fields: ['executedAt'],
                    description: 'Индекс для сортировки по дате исполнения'
                },
                {
                    name: 'idx_trading_requests_created_at',
                    fields: ['createdAt'],
                    description: 'Индекс для сортировки по дате создания'
                },
                {
                    name: 'idx_trading_requests_figi_action_status',
                    fields: ['figi', 'action', 'status'],
                    description: 'Составной индекс для частых запросов по FIGI, действию и статусу'
                }
            ],
            Recommendations: [
                {
                    name: 'idx_recommendations_analysis_date',
                    fields: ['analysisDate'],
                    description: 'Индекс для сортировки по дате анализа'
                },
                {
                    name: 'idx_recommendations_valid_until',
                    fields: ['validUntil'],
                    description: 'Индекс для поиска активных рекомендаций'
                },
                {
                    name: 'idx_recommendations_is_active',
                    fields: ['isActive'],
                    description: 'Индекс для фильтрации активных рекомендаций'
                },
                {
                    name: 'idx_recommendations_recommendation_confidence',
                    fields: ['recommendation', 'confidence'],
                    description: 'Составной индекс для фильтрации по типу и уверенности'
                }
            ],
            cached_signals: [
                {
                    name: 'idx_cached_signals_figi',
                    fields: ['figi'],
                    description: 'Индекс для поиска сигналов по FIGI'
                },
                {
                    name: 'idx_cached_signals_create_dt',
                    fields: ['createDt'],
                    description: 'Индекс для сортировки по дате создания'
                },
                {
                    name: 'idx_cached_signals_end_dt',
                    fields: ['endDt'],
                    description: 'Индекс для фильтрации активных сигналов'
                },
                {
                    name: 'idx_cached_signals_direction',
                    fields: ['direction'],
                    description: 'Индекс для фильтрации по направлению'
                },
                {
                    name: 'idx_cached_signals_figi_create_dt',
                    fields: ['figi', 'createDt'],
                    description: 'Составной индекс для поиска сигналов по FIGI с сортировкой'
                }
            ],
            cached_candles: [
                {
                    name: 'idx_cached_candles_figi_interval',
                    fields: ['figi', 'interval'],
                    description: 'Составной индекс для поиска свечей по FIGI и интервалу'
                },
                {
                    name: 'idx_cached_candles_time',
                    fields: ['time'],
                    description: 'Индекс для сортировки и фильтрации по времени'
                },
                {
                    name: 'idx_cached_candles_figi_interval_time',
                    fields: ['figi', 'interval', 'time'],
                    description: 'Составной индекс для частых запросов свечей'
                }
            ],
            cached_instruments: [
                {
                    name: 'idx_cached_instruments_figi',
                    fields: ['figi'],
                    description: 'Индекс для поиска инструментов по FIGI (уникальный)'
                },
                {
                    name: 'idx_cached_instruments_ticker',
                    fields: ['ticker'],
                    description: 'Индекс для поиска по тикеру'
                },
                {
                    name: 'idx_cached_instruments_last_updated',
                    fields: ['lastUpdated'],
                    description: 'Индекс для сортировки по дате обновления'
                }
            ],
            position_strategies: [
                {
                    name: 'idx_position_strategies_position_id',
                    fields: ['positionId'],
                    description: 'Индекс для поиска стратегий по позиции'
                },
                {
                    name: 'idx_position_strategies_strategy_id',
                    fields: ['strategyId'],
                    description: 'Индекс для поиска позиций по стратегии'
                }
            ],
            portfolio_allocations: [
                {
                    name: 'idx_portfolio_allocations_strategy_id',
                    fields: ['strategyId'],
                    description: 'Индекс для поиска аллокаций по стратегии'
                },
                {
                    name: 'idx_portfolio_allocations_last_updated',
                    fields: ['lastUpdated'],
                    description: 'Индекс для сортировки по дате обновления'
                }
            ],
            trading_strategies: [
                {
                    name: 'idx_trading_strategies_type',
                    fields: ['type'],
                    description: 'Индекс для фильтрации по типу стратегии'
                },
                {
                    name: 'idx_trading_strategies_is_active',
                    fields: ['isActive'],
                    description: 'Индекс для фильтрации активных стратегий'
                }
            ]
        };
    }
    
    /**
     * Создание индекса
     */
    async createIndex(tableName, indexName, fields, options = {}) {
        try {
            const queryInterface = this.sequelize.getQueryInterface();
            
            // Проверяем, существует ли индекс (используем параметризованный запрос для безопасности)
            const existingIndexes = await this.sequelize.query(
                `SELECT indexname 
                 FROM pg_indexes 
                 WHERE schemaname = 'public' 
                 AND tablename = $1 
                 AND indexname = $2`,
                { 
                    bind: [tableName, indexName],
                    type: this.sequelize.QueryTypes.SELECT 
                }
            );
            
            if (existingIndexes.length > 0) {
                LoggerService.warn('Индекс уже существует', {
                    service: 'DatabaseOptimization',
                    tableName,
                    indexName
                });
                return { created: false, exists: true };
            }
            
            // Создаем индекс
            await queryInterface.addIndex(tableName, fields, {
                name: indexName,
                ...options
            });
            
            LoggerService.info('Индекс создан', {
                service: 'DatabaseOptimization',
                tableName,
                indexName,
                fields
            });
            
            return { created: true, exists: false };
        } catch (error) {
            LoggerService.error('Ошибка создания индекса', {
                service: 'DatabaseOptimization',
                tableName,
                indexName,
                fields,
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
    
    /**
     * Создание всех рекомендуемых индексов
     */
    async createRecommendedIndexes(dryRun = false) {
        const recommended = this.getRecommendedIndexes();
        const results = {
            created: [],
            skipped: [],
            errors: []
        };
        
        for (const [tableName, indexes] of Object.entries(recommended)) {
            // Проверяем существование таблицы (используем параметризованный запрос)
            const tableExists = await this.sequelize.query(
                `SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                )`,
                { 
                    bind: [tableName],
                    type: this.sequelize.QueryTypes.SELECT 
                }
            );
            
            if (!tableExists[0].exists) {
                LoggerService.warn('Таблица не существует', {
                    service: 'DatabaseOptimization',
                    tableName
                });
                continue;
            }
            
            for (const index of indexes) {
                try {
                    if (dryRun) {
                        results.created.push({
                            table: tableName,
                            index: index.name,
                            fields: index.fields,
                            description: index.description
                        });
                    } else {
                        const result = await this.createIndex(
                            tableName,
                            index.name,
                            index.fields
                        );
                        
                        if (result.created) {
                            results.created.push({
                                table: tableName,
                                index: index.name,
                                fields: index.fields
                            });
                        } else {
                            results.skipped.push({
                                table: tableName,
                                index: index.name,
                                reason: 'already exists'
                            });
                        }
                    }
                } catch (error) {
                    results.errors.push({
                        table: tableName,
                        index: index.name,
                        error: error.message
                    });
                }
            }
        }
        
        return results;
    }
    
    /**
     * Анализ медленных запросов (требует включения pg_stat_statements)
     */
    async analyzeSlowQueries(limit = 10) {
        try {
            // Проверяем, доступен ли pg_stat_statements
            const extensionExists = await this.sequelize.query(
                `SELECT EXISTS (
                    SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
                )`,
                { type: this.sequelize.QueryTypes.SELECT }
            );
            
            if (!extensionExists[0].exists) {
                LoggerService.warn('pg_stat_statements не установлен', {
                    service: 'DatabaseOptimization'
                });
                return {
                    available: false,
                    message: 'pg_stat_statements extension not installed'
                };
            }
            
            const slowQueries = await this.sequelize.query(
                `SELECT 
                    query,
                    calls,
                    total_exec_time,
                    mean_exec_time,
                    max_exec_time,
                    stddev_exec_time
                 FROM pg_stat_statements
                 WHERE query NOT LIKE '%pg_stat_statements%'
                 ORDER BY mean_exec_time DESC
                 LIMIT ${limit}`,
                { type: this.sequelize.QueryTypes.SELECT }
            );
            
            return {
                available: true,
                queries: slowQueries
            };
        } catch (error) {
            LoggerService.error('Ошибка анализа медленных запросов', {
                service: 'DatabaseOptimization',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            return {
                available: false,
                error: error.message
            };
        }
    }
    
    /**
     * Полный отчет об оптимизации
     */
    async generateOptimizationReport() {
        try {
            const currentIndexes = await this.analyzeIndexes();
            const recommendedIndexes = this.getRecommendedIndexes();
            const slowQueries = await this.analyzeSlowQueries();
            
            // Анализ недостающих индексов
            const missingIndexes = {};
            
            for (const [tableName, indexes] of Object.entries(recommendedIndexes)) {
                const current = currentIndexes[tableName] || { indexes: [] };
                const currentIndexNames = current.indexes.map(idx => idx.name);
                
                const missing = indexes.filter(
                    idx => !currentIndexNames.includes(idx.name)
                );
                
                if (missing.length > 0) {
                    missingIndexes[tableName] = missing;
                }
            }
            
            return {
                currentIndexes,
                recommendedIndexes,
                missingIndexes,
                slowQueries,
                summary: {
                    totalTables: Object.keys(currentIndexes).length,
                    totalCurrentIndexes: Object.values(currentIndexes).reduce(
                        (sum, table) => sum + table.count, 0
                    ),
                    totalRecommendedIndexes: Object.values(recommendedIndexes).reduce(
                        (sum, indexes) => sum + indexes.length, 0
                    ),
                    missingIndexesCount: Object.values(missingIndexes).reduce(
                        (sum, indexes) => sum + indexes.length, 0
                    )
                }
            };
        } catch (error) {
            LoggerService.error('Ошибка генерации отчета', {
                service: 'DatabaseOptimization',
                error: {
                    message: error.message,
                    stack: error.stack
                }
            });
            throw error;
        }
    }
}

export default new DatabaseOptimization();

