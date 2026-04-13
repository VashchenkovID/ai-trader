/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SuccessEnvelope_HealthDTO_ } from '../models/SuccessEnvelope_HealthDTO_';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class HealthService {

    /**
     * Проверка доступности сервиса (корень приложения)
     * Для балансировщиков и k8s probe. Версионированный аналог: GET /api/v1/health.
     * @returns SuccessEnvelope_HealthDTO_ Successful Response
     * @throws ApiError
     */
    public static healthHealthGet(): CancelablePromise<SuccessEnvelope_HealthDTO_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/health',
        });
    }

    /**
     * Проверка здоровья API (v1)
     * Тот же контракт SuccessEnvelope[HealthDTO], что GET /health на корне; путь под префиксом /api/v1 для клиентов, привязанных к версии API.
     * @returns SuccessEnvelope_HealthDTO_ Successful Response
     * @throws ApiError
     */
    public static healthV1ApiV1HealthGet(): CancelablePromise<SuccessEnvelope_HealthDTO_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/health',
        });
    }

}
