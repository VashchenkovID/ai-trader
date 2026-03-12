/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SuccessEnvelope_dict_str__object__ } from '../models/SuccessEnvelope_dict_str__object__';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class ProfitabilityService {

    /**
     * Статус блока прибыльности
     * Возвращает состояние трекера прибыльности.
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static profitabilityStatusApiV1ProfitabilityStatusGet(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/profitability/status',
        });
    }

    /**
     * Агрегированный анализ прибыльности
     * Возвращает агрегированный анализ прибыльности.
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static profitabilityAnalysisApiV1ProfitabilityAnalysisGet(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/profitability/analysis',
        });
    }

    /**
     * Отчет по прибыльности
     * Возвращает отчет о прибыльности для UI.
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static profitabilityReportApiV1ProfitabilityReportGet(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/profitability/report',
        });
    }

}
