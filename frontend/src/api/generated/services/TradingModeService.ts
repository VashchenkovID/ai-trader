/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SuccessEnvelope_dict_ } from '../models/SuccessEnvelope_dict_';
import type { TradingModeSwitchRequest } from '../models/TradingModeSwitchRequest';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class TradingModeService {

    /**
     * Текущий режим торговли
     * Возвращает текущий режим торговли (paper, real, micro).
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static tradingModeCurrentApiV1TradingModeCurrentGet(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/trading-mode/current',
        });
    }

    /**
     * Переключить режим
     * Переключает режим торговли.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static tradingModeSwitchApiV1TradingModeSwitchPost({
requestBody,
}: {
requestBody: TradingModeSwitchRequest,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/trading-mode/switch',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Проверить возможность переключения
     * Проверяет, можно ли переключиться на указанный режим.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static tradingModeCanSwitchApiV1TradingModeCanSwitchModeGet({
mode,
}: {
/**
 * Целевой режим
 */
mode: string,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/trading-mode/can-switch/{mode}',
            path: {
                'mode': mode,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
