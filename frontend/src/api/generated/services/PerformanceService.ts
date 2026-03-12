/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SuccessEnvelope_dict_str__object__ } from '../models/SuccessEnvelope_dict_str__object__';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class PerformanceService {

    /**
     * Анализ по секторам
     * Возвращает доходность по секторам за период.
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static performanceSectorAnalysisApiV1PerformanceSectorAnalysisGet({
days = 30,
offset,
limit = 200,
}: {
days?: number,
offset?: number,
limit?: number,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/performance/sector-analysis',
            query: {
                'days': days,
                'offset': offset,
                'limit': limit,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Данные для дашборда производительности
     * Возвращает агрегированные данные дашборда.
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static performanceDashboardApiV1PerformanceVisualizationDashboardGet({
period = 30,
strategy,
sector,
}: {
period?: number,
strategy?: (string | null),
sector?: (string | null),
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/performance/visualization/dashboard',
            query: {
                'period': period,
                'strategy': strategy,
                'sector': sector,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Список бенчмарков
     * Возвращает список доступных бенчмарков.
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static performanceBenchmarkListApiV1PerformanceBenchmarkListGet({
offset,
limit = 200,
}: {
offset?: number,
limit?: number,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/performance/benchmark/list',
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
     * Список секторов
     * Возвращает список секторов для фильтров аналитики.
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static performanceSectorsApiV1PerformanceSectorsGet({
offset,
limit = 200,
}: {
offset?: number,
limit?: number,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/performance/sectors',
            query: {
                'offset': offset,
                'limit': limit,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
