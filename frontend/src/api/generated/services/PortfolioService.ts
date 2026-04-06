/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SuccessEnvelope_dict_ } from '../models/SuccessEnvelope_dict_';
import type { SuccessEnvelope_dict_str__object__ } from '../models/SuccessEnvelope_dict_str__object__';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class PortfolioService {

    /**
     * Портфель (реальный счёт Tinkoff)
     * Возвращает данные реального портфеля из Tinkoff Invest API.
 * Контракт: cash, positions, totalValue, positionsValue (совместим с performRealPortfolioSync).
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getPortfolioApiV1PortfolioGet(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio/',
        });
    }

    /**
     * Портфель (реальный счёт Tinkoff)
     * Возвращает данные реального портфеля из Tinkoff Invest API.
 * Контракт: cash, positions, totalValue, positionsValue (совместим с performRealPortfolioSync).
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getPortfolioApiV1PortfolioGet1(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio',
        });
    }

    /**
     * Синхронизация портфеля (то же что GET /portfolio)
     * Явный запрос синхронизации портфеля — те же данные, что GET /portfolio.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static portfolioSyncApiV1PortfolioSyncGet(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio/sync',
        });
    }

    /**
     * Фоновый sync портфеля
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static portfolioSyncTriggerApiV1PortfolioSyncPost(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/portfolio/sync',
        });
    }

    /**
     * Фоновый sync реального портфеля из Tinkoff
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static realPortfolioSyncTriggerApiV1PortfolioRealSyncPost(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/portfolio/real/sync',
        });
    }

    /**
     * Статус последнего sync портфеля
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static portfolioSyncStatusApiV1PortfolioSyncStatusGet(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio/sync/status',
        });
    }

    /**
     * Виртуальный портфель (paper, из БД)
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getVirtualPortfolioApiV1PortfolioVirtualGet(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio/virtual',
        });
    }

    /**
     * Рекомендации по FIGI позиций портфеля (пакетно)
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getPortfolioPositionRecommendationsApiV1PortfolioPositionRecommendationsGet(
        params?: { figi?: string[] },
    ): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio/position-recommendations',
            query: {
                figi: params?.figi,
            },
        });
    }

}
