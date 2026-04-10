/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FigisRequest } from '../models/FigisRequest';
import type { SingleFigiCandles } from '../models/SingleFigiCandles';
import type { SuccessEnvelope_dict_ } from '../models/SuccessEnvelope_dict_';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class QuantService {

    /**
     * Матрица дневных доходностей по FIGI
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static postReturnsMatrixApiV1QuantReturnsMatrixPost({
requestBody,
}: {
requestBody: FigisRequest,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/quant/returns-matrix',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Ночной артефакт матрицы (DATA_CONTRACT)
     * Читает `data/quant/returns_matrix_latest.json` без пересчёта (потребитель §5).
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getReturnsMatrixArtifactApiV1QuantReturnsMatrixArtifactGet(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/quant/returns-matrix-artifact',
        });
    }

    /**
     * Веса max Sharpe (PyPortfolioOpt)
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static postOptimizeMaxSharpeApiV1QuantOptimizeMaxSharpePost({
requestBody,
}: {
requestBody: FigisRequest,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/quant/optimize-max-sharpe',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * RSI / Bollinger width по свечам из БД (§2, feature-flag)
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static postIndicatorsPreviewApiV1QuantIndicatorsPreviewPost({
requestBody,
}: {
requestBody: SingleFigiCandles,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/quant/indicators-preview',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
