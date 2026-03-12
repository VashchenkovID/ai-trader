/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SuccessEnvelope_dict_str__object__ } from '../models/SuccessEnvelope_dict_str__object__';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class NewsService {

    /**
     * Статус новостного контура
     * Возвращает состояние новостного контура.
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static newsStatusApiV1NewsStatusGet(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/news/status',
        });
    }

    /**
     * Инструменты для новостной выборки
     * Возвращает инструменты, доступные для новостной выборки.
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static newsInstrumentsApiV1NewsInstrumentsGet({
offset,
limit = 200,
}: {
offset?: number,
limit?: number,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/news/instruments',
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
     * Новости по FIGI
     * Возвращает новости по FIGI и метаданные запроса.
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static newsByFigiApiV1NewsFigiGet({
figi,
offset,
limit = 20,
days = 30,
}: {
figi: string,
offset?: number,
limit?: number,
days?: number,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/news/{figi}',
            path: {
                'figi': figi,
            },
            query: {
                'offset': offset,
                'limit': limit,
                'days': days,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
