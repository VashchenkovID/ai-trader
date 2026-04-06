/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CanaryBody } from '../models/CanaryBody';
import type { OpsModeBody } from '../models/OpsModeBody';
import type { SuccessEnvelope_dict_str__object__ } from '../models/SuccessEnvelope_dict_str__object__';
import type { TriggerResponse } from '../models/TriggerResponse';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class SystemService {

    /**
     * Технические метрики приложения
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static metricsApiV1MetricsGet(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/metrics',
        });
    }

    /**
     * Демо генерации ошибки
     * @returns any Successful Response
     * @throws ApiError
     */
    public static demoErrorApiV1ErrorsDemoGet({
code = 'INVALID_STATE_TRANSITION',
}: {
code?: string,
}): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/errors/demo',
            query: {
                'code': code,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Сводный статус подсистем
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static systemStatusApiV1SystemStatusGet(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/system/status',
        });
    }

    /**
     * Проверка состояния системы
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static systemHealthApiV1SystemHealthGet(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/system/health',
        });
    }

    /**
     * Системные настройки
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static systemSettingsApiV1SystemSettingsGet({
offset,
limit = 200,
}: {
offset?: number,
limit?: number,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/system/settings',
            query: {
                'offset': offset,
                'limit': limit,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Метрики производительности системы
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static performanceMetricsApiV1PerformanceMetricsGet(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/performance/metrics',
        });
    }

    /**
     * Метрики производительности системы
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static performanceMetricsApiV1SystemPerformanceMetricsGet(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/system/performance/metrics',
        });
    }

    /**
     * Базовые целевые показатели производительности
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static performanceBaselineApiV1SystemPerformanceBaselineGet(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/system/performance/baseline',
        });
    }

    /**
     * Текущий операционный режим cutover
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static opsStatusApiV1SystemOpsStatusGet(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/system/ops/status',
        });
    }

    /**
     * Переключить операционный режим cutover
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static opsSetModeApiV1SystemOpsModePost({
requestBody,
}: {
requestBody: OpsModeBody,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/ops/mode',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Включить canary и задать процент
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static opsSetCanaryApiV1SystemOpsCanaryPost({
requestBody,
}: {
requestBody: CanaryBody,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/ops/canary',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Экстренный rollback режим (блокирует write)
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static opsRollbackApiV1SystemOpsRollbackPost(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/ops/rollback',
        });
    }

    /**
     * Создать snapshot перед cutover/rollback
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static opsBackupApiV1SystemOpsBackupPost(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/ops/backup',
        });
    }

    /**
     * Список фоновых задач
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static systemTasksApiV1SystemTasksGet({
limit = 100,
}: {
limit?: number,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/system/tasks',
            query: {
                'limit': limit,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Статус фоновой задачи
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static systemTaskApiV1SystemTasksTaskIdGet({
taskId,
}: {
taskId: string,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/system/tasks/{task_id}',
            path: {
                'task_id': taskId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Статусы cron-задач планировщика
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static systemSchedulerStatusApiV1SystemSchedulerStatusGet(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/system/scheduler/status',
        });
    }

    /**
     * Файловый реестр ошибок приложения
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static systemErrorsRegistryApiV1SystemErrorsRegistryGet({
limit = 100,
}: {
limit?: number,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/system/errors/registry',
            query: {
                'limit': limit,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Фоновый запуск cache update
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static systemCacheUpdateApiV1SystemCacheUpdatePost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/cache/update',
        });
    }

    /**
     * Фоновый запуск полного cache update
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static systemCacheFullUpdateApiV1SystemCacheFullUpdatePost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/cache/full-update',
        });
    }

    /**
     * Фоновая полная загрузка данных за год
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static systemDataFullSyncYearApiV1SystemDataFullSyncYearPost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/data/full-sync-year',
        });
    }

    /**
     * Фоновый запуск быстрого обучения
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static systemTrainingQuickApiV1SystemTrainingQuickPost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/training/quick',
        });
    }

    /**
     * Фоновый запуск полного обучения
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static systemTrainingFullApiV1SystemTrainingFullPost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/training/full',
        });
    }

    /**
     * Фоновая синхронизация ассетов
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static assetsSyncApiV1AssetsSyncPost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/assets/sync',
        });
    }

    /**
     * Фоновый sync+fill фундаментала
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static fundamentalSyncAndFillApiV1FundamentalDataSyncAndFillPost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/fundamental-data/sync-and-fill',
        });
    }

    /**
     * Фоновое заполнение фундаментала
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static fundamentalFillAllApiV1FundamentalDataFillAllPost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/fundamental-data/fill-all',
        });
    }

    /**
     * Фоновое обновление макро данных
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static macroUpdateApiV1MacroDataUpdatePost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/macro-data/update',
        });
    }

    /**
     * Фоновая загрузка рыночных индексов
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static macroLoadIndicesApiV1MacroDataLoadIndicesPost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/macro-data/load-indices',
        });
    }

    /**
     * Фоновое обновление сигналов
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static signalsUpdateApiV1SignalsUpdatePost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/signals/update',
        });
    }

    /**
     * Фоновое обновление опционных данных
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static optionsUpdateAllApiV1OptionsDataUpdateAllPost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/options-data/update-all',
        });
    }

    /**
     * Фоновое обновление торговых окон
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static tradingWindowsUpdateApiV1TradingWindowsUpdatePost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/trading-windows/update',
        });
    }

    /**
     * Фоновый price-loop портфеля
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static portfolioPricesUpdateApiV1SystemPriceLoopsPortfolioPost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/price-loops/portfolio',
        });
    }

    /**
     * Фоновый price-loop активных сигналов
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static signalsPricesUpdateApiV1SystemPriceLoopsSignalsPost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/price-loops/signals',
        });
    }

    /**
     * Фоновый price-loop торговых заявок
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static tradingRequestsPricesUpdateApiV1SystemPriceLoopsTradingRequestsPost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/price-loops/trading-requests',
        });
    }

    /**
     * Фоновый weekly backtest
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static governanceWeeklyBacktestApiV1SystemGovernanceWeeklyBacktestPost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/governance/weekly-backtest',
        });
    }

    /**
     * Фоновый dynamic budget rebalance
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static governanceDynamicBudgetApiV1SystemGovernanceDynamicBudgetPost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/governance/dynamic-budget',
        });
    }

    /**
     * Фоновый portfolio rebalancing
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static governanceRebalancingApiV1SystemGovernanceRebalancingPost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/governance/rebalancing',
        });
    }

    /**
     * Фоновый мониторинг позиций
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static riskPositionMonitoringApiV1SystemRiskPositionMonitoringPost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/risk/position-monitoring',
        });
    }

    /**
     * Фоновая проверка partial-exit
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static riskPartialExitApiV1SystemRiskPartialExitPost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/risk/partial-exit',
        });
    }

    /**
     * Фоновая проверка trailing-stops
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static riskTrailingStopsApiV1SystemRiskTrailingStopsPost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/risk/trailing-stops',
        });
    }

    /**
     * Фоновая генерация weekly forecast
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static systemTrainingWeeklyGenerationApiV1SystemTrainingWeeklyGenerationPost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/training/weekly-generation',
        });
    }

    /**
     * Фоновое обновление weekly forecast
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static systemTrainingWeeklyUpdateApiV1SystemTrainingWeeklyUpdatePost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/training/weekly-update',
        });
    }

    /**
     * Фоновый анализ рынка и портфеля
     * @returns TriggerResponse Successful Response
     * @throws ApiError
     */
    public static analysisMarketPortfolioApiV1SystemAnalysisMarketPortfolioPost(): CancelablePromise<TriggerResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/system/analysis/market-portfolio',
        });
    }

    /**
     * KPI-отчёт по эффективности анализа
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static analysisKpiApiV1SystemAnalysisKpiGet({
        window = '7d',
    }: {
        window?: '24h' | '7d' | '30d',
    }): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/system/analysis/kpi',
            query: {
                window: window,
            },
        });
    }

    /**
     * Статус обновления торговых окон
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static tradingWindowsStatusApiV1TradingWindowsStatusGet(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/trading-windows/status',
        });
    }

}
