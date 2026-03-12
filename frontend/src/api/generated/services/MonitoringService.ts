/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SuccessEnvelope_dict_str__object__ } from '../models/SuccessEnvelope_dict_str__object__';
import type { SuccessEnvelope_dict_str__str__ } from '../models/SuccessEnvelope_dict_str__str__';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class MonitoringService {

    /**
     * Маршрутные метрики мониторинга
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static monitoringMetricsApiV1MonitoringMetricsGet(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/monitoring/metrics',
        });
    }

    /**
     * Список активных алертов
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static monitoringAlertsApiV1MonitoringAlertsGet({
category,
severity,
resolved,
limit = 50,
}: {
category?: (string | null),
severity?: (string | null),
resolved?: (boolean | null),
limit?: number,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/monitoring/alerts',
            query: {
                'category': category,
                'severity': severity,
                'resolved': resolved,
                'limit': limit,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Пометить алерт как решенный
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static resolveAlertApiV1MonitoringAlertsAlertIdResolvePost({
alertId,
}: {
alertId: string,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/monitoring/alerts/{alert_id}/resolve',
            path: {
                'alert_id': alertId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Агрегированные метрики производительности
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static monitoringPerformanceApiV1MonitoringPerformanceGet(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/monitoring/performance',
        });
    }

    /**
     * Проверка состояния мониторинга
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static monitoringHealthApiV1MonitoringHealthGet(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/monitoring/health',
        });
    }

    /**
     * Сводный отчет мониторинга
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static monitoringReportApiV1MonitoringReportGet(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/monitoring/report',
        });
    }

    /**
     * Сброс собранных метрик
     * @returns SuccessEnvelope_dict_str__str__ Successful Response
     * @throws ApiError
     */
    public static monitoringResetApiV1MonitoringResetPost(): CancelablePromise<SuccessEnvelope_dict_str__str__> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/monitoring/reset',
        });
    }

}
