/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { RiskValidateRequest } from '../models/RiskValidateRequest';
import type { SuccessEnvelope_dict_ } from '../models/SuccessEnvelope_dict_';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class RiskService {

    /**
     * Статус риск-менеджмента
     * Возвращает статус, лимиты и статистику.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static riskStatusApiV1RiskStatusGet(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/risk/status',
        });
    }

    /**
     * Лимиты риска
     * Возвращает текущие лимиты.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static riskLimitsApiV1RiskLimitsGet(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/risk/limits',
        });
    }

    /**
     * Обновить лимиты
     * Обновляет лимиты риск-менеджмента.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static riskLimitsUpdateApiV1RiskLimitsPost({
requestBody,
}: {
requestBody: Record<string, any>,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/risk/limits',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Валидировать ордер
     * Проверяет ордер по лимитам риска.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static riskValidateApiV1RiskValidatePost({
requestBody,
}: {
requestBody: RiskValidateRequest,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/risk/validate',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Верхняя доля позиции из max-Sharpe (preflight real, §5)
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static riskRealCapPreviewApiV1RiskRealCapPreviewFigiGet({
figi,
}: {
figi: string,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/risk/real-cap-preview/{figi}',
            path: {
                'figi': figi,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
