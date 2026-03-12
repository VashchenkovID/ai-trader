/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SuccessEnvelope_dict_ } from '../models/SuccessEnvelope_dict_';
import type { TradingRequestApproveRequest } from '../models/TradingRequestApproveRequest';
import type { TradingRequestCreateRequest } from '../models/TradingRequestCreateRequest';
import type { TradingRequestExecuteRequest } from '../models/TradingRequestExecuteRequest';
import type { TradingRequestRejectRequest } from '../models/TradingRequestRejectRequest';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class TradingRequestsService {

    /**
     * Список торговых заявок
     * Возвращает список торговых заявок с пагинацией.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static tradingRequestsListApiV1TradingRequestsGet({
status,
mode,
offset,
limit = 50,
}: {
/**
 * Фильтр по статусу
 */
status?: (string | null),
/**
 * Фильтр по режиму
 */
mode?: (string | null),
offset?: number,
limit?: number,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/trading-requests',
            query: {
                'status': status,
                'mode': mode,
                'offset': offset,
                'limit': limit,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Ожидающие заявки
     * Возвращает заявки со статусом PENDING.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static tradingRequestsPendingApiV1TradingRequestsPendingGet({
offset,
limit = 50,
}: {
offset?: number,
limit?: number,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/trading-requests/pending',
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
     * Одобренные заявки
     * Возвращает заявки со статусом APPROVED.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static tradingRequestsApprovedApiV1TradingRequestsApprovedGet({
offset,
limit = 50,
}: {
offset?: number,
limit?: number,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/trading-requests/approved',
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
     * Создать заявку
     * Создает заявку из рекомендации (FIGI) или из переданных данных.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static tradingRequestCreateApiV1TradingRequestsCreatePost({
requestBody,
}: {
requestBody: TradingRequestCreateRequest,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/trading-requests/create',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Одобрить заявку
     * Переводит заявку из PENDING в APPROVED.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static tradingRequestApproveApiV1TradingRequestsRequestIdApprovePost({
requestId,
requestBody,
}: {
/**
 * ID заявки
 */
requestId: string,
requestBody?: (TradingRequestApproveRequest | null),
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/trading-requests/{request_id}/approve',
            path: {
                'request_id': requestId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Отклонить заявку
     * Переводит заявку из PENDING в REJECTED.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static tradingRequestRejectApiV1TradingRequestsRequestIdRejectPost({
requestId,
requestBody,
}: {
/**
 * ID заявки
 */
requestId: string,
requestBody?: (TradingRequestRejectRequest | null),
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/trading-requests/{request_id}/reject',
            path: {
                'request_id': requestId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Исполнить заявку
     * Переводит заявку из APPROVED в EXECUTED.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static tradingRequestExecuteApiV1TradingRequestsRequestIdExecutePost({
requestId,
requestBody,
}: {
/**
 * ID заявки
 */
requestId: string,
requestBody?: (TradingRequestExecuteRequest | null),
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/trading-requests/{request_id}/execute',
            path: {
                'request_id': requestId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Отменить заявку
     * Отменяет заявку (PENDING или APPROVED).
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static tradingRequestCancelApiV1TradingRequestsRequestIdCancelPost({
requestId,
}: {
/**
 * ID заявки
 */
requestId: string,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/trading-requests/{request_id}/cancel',
            path: {
                'request_id': requestId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Статистика заявок
     * Возвращает агрегаты по статусам заявок.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static tradingRequestsStatsApiV1TradingRequestsStatsGet({
mode,
}: {
/**
 * Фильтр по режиму
 */
mode?: (string | null),
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/trading-requests/stats',
            query: {
                'mode': mode,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
