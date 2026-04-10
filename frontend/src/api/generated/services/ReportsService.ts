/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SuccessEnvelope_dict_ } from '../models/SuccessEnvelope_dict_';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class ReportsService {

    /**
     * Ежедневная сводка (стабильный payload)
     * Агрегаты по БД + снимок real_portfolio. Контракт фиксирован для дашбордов/CI smoke.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getDailySummaryApiV1ReportsDailySummaryGet(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/reports/daily-summary',
        });
    }

    /**
     * Пример метрик симуляции исполнения (MVP)
     * Детерминированный пример для TRACEABILITY / smoke; не влияет на ордера.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getExecutionSimulatorSampleApiV1ReportsExecutionSimulatorSampleGet(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/reports/execution-simulator-sample',
        });
    }

}
