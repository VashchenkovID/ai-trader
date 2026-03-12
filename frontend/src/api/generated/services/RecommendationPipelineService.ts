/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SuccessEnvelope_dict_ } from '../models/SuccessEnvelope_dict_';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class RecommendationPipelineService {

    /**
     * Запустить pipeline рекомендаций
     * Обрабатывает рекомендации, проверяет пороги и дедупликацию, создает заявки.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static recommendationPipelineRunApiV1RecommendationPipelineRunPost({
mode = 'paper',
minConfidence,
minScore,
limit = 50,
}: {
/**
 * Режим торговли
 */
mode?: string,
/**
 * Минимальная уверенность (0-1)
 */
minConfidence?: (number | null),
/**
 * Минимальный скоринг (0-1)
 */
minScore?: (number | null),
limit?: number,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/recommendation-pipeline/run',
            query: {
                'mode': mode,
                'minConfidence': minConfidence,
                'minScore': minScore,
                'limit': limit,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
