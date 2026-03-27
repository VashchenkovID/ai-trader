/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SuccessEnvelope_dict_str__object__ } from '../models/SuccessEnvelope_dict_str__object__';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class MarketService {

    /**
     * Список инструментов
     * Возвращает список рыночных инструментов.
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static marketInstrumentsApiV1MarketInstrumentsGet({
offset,
limit = 200,
}: {
offset?: number,
limit?: number,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/market/instruments',
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
     * Список рекомендаций
     * Возвращает рекомендации по инструментам.
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static marketRecommendationsApiV1MarketRecommendationsGet({
offset,
limit = 200,
}: {
offset?: number,
limit?: number,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/market/recommendations',
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
     * Рекомендация по FIGI
     * Последняя рекомендация по инструменту (тот же DTO, что в списке).
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static marketRecommendationByFigiApiV1MarketRecommendationsFigiGet({
figi,
}: {
figi: string,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/market/recommendations/{figi}',
            path: {
                'figi': figi,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Карточка инструмента по FIGI
     * Возвращает детальную карточку инструмента.
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static marketStockApiV1MarketStockFigiGet({
figi,
}: {
figi: string,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/market/stock/{figi}',
            path: {
                'figi': figi,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Свечи инструмента по FIGI
     * Возвращает историю свечей для инструмента.
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static marketStockCandlesApiV1MarketStockFigiCandlesGet({
figi,
offset,
limit = 365,
}: {
figi: string,
offset?: number,
limit?: number,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/market/stock/{figi}/candles',
            path: {
                'figi': figi,
            },
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
     * Сигналы аналитиков по FIGI
     * Сигналы из БД (синхронизация scheduler signals_update).
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static marketStockAnalystSignalsApiV1MarketStockFigiAnalystSignalsGet({
figi,
}: {
figi: string,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/market/stock/{figi}/analyst-signals',
            path: {
                'figi': figi,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Weekly LSTM: прогноз (из БД или refresh)
     * Сохранённый weekly-прогноз по рекомендации; при refresh — повторный инференс.
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static marketStockWeeklyForecastApiV1MarketStockFigiWeeklyForecastGet({
figi,
refresh = false,
}: {
figi: string,
/**
 * Пересчитать модель и записать в БД
 */
refresh?: boolean,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/market/stock/{figi}/weekly-forecast',
            path: {
                'figi': figi,
            },
            query: {
                'refresh': refresh,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Фоновый refresh рыночных данных
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static marketRefreshApiV1MarketRefreshPost(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/market/refresh',
        });
    }

}
