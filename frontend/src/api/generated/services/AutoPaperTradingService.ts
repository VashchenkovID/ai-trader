/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SuccessEnvelope_dict_ } from '../models/SuccessEnvelope_dict_';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class AutoPaperTradingService {

    /**
     * Статус автоматической торговли
     * Возвращает статус auto-paper: enabled, currentPhase, tradingMode.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static autoPaperStatusApiV1AutoPaperTradingStatusGet(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/auto-paper-trading/status',
        });
    }

    /**
     * Включить автоторговлю
     * Включает автоторговлю. Разрешено только в режиме paper.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static autoPaperEnableApiV1AutoPaperTradingEnablePost(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/auto-paper-trading/enable',
        });
    }

    /**
     * Выключить автоторговлю
     * Выключает автоторговлю.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static autoPaperDisableApiV1AutoPaperTradingDisablePost(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/auto-paper-trading/disable',
        });
    }

    /**
     * Проверка возможности автоисполнения
     * Проверяет, можно ли автоматически исполнить заявку (paper, enabled, PENDING, risk OK).
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static autoPaperCanExecuteApiV1AutoPaperTradingCanExecuteRequestIdGet({
requestId,
}: {
/**
 * ID заявки
 */
requestId: string,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/auto-paper-trading/can-execute/{request_id}',
            path: {
                'request_id': requestId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Автоисполнение заявки
     * Approve + Execute для PENDING заявки (только paper, auto-paper enabled).
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static autoPaperExecuteApiV1AutoPaperTradingExecuteRequestIdPost({
requestId,
}: {
/**
 * ID заявки
 */
requestId: string,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/auto-paper-trading/execute/{request_id}',
            path: {
                'request_id': requestId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Статистика автоторговли
     * Возвращает статистику исполненных заявок в paper-режиме.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static autoPaperStatsApiV1AutoPaperTradingStatsGet({
startDate,
endDate,
}: {
/**
 * Начало периода
 */
startDate?: (string | null),
/**
 * Конец периода
 */
endDate?: (string | null),
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/auto-paper-trading/stats',
            query: {
                'startDate': startDate,
                'endDate': endDate,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
