/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SuccessEnvelope_dict_ } from '../models/SuccessEnvelope_dict_';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class PreflightCheckService {

    /**
     * Запустить проверку готовности
     * Выполняет комплексную проверку готовности к торговле.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static preflightRunApiV1PreflightCheckRunPost(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/preflight-check/run',
        });
    }

    /**
     * Статус последней проверки
     * Возвращает статус последней выполненной проверки.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static preflightStatusApiV1PreflightCheckStatusGet(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/preflight-check/status',
        });
    }

    /**
     * Результаты проверки
     * Возвращает полные результаты последней проверки.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static preflightResultsApiV1PreflightCheckResultsGet(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/preflight-check/results',
        });
    }

}
