/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PortfolioManualApplyBody } from '../models/PortfolioManualApplyBody';
import type { SuccessEnvelope_dict_ } from '../models/SuccessEnvelope_dict_';
import type { VerdictRequest } from '../models/VerdictRequest';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class PortfolioAnalysisService {

    /**
     * Промпт для ручного копирования во внешнюю нейросеть (вердикт по позициям портфеля)
     * Возвращает текст промпта и список FIGI. Порядок FIGI важен для POST manual/apply.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getManualPromptApiV1PortfolioAnalysisManualPromptGet({
portfolioScope,
figi,
}: {
/**
 * real или virtual:moderate и т.д.
 */
portfolioScope: string,
/**
 * Опционально: только эти FIGI, в заданном порядке
 */
figi?: Array<string>,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio-analysis/manual/prompt',
            query: {
                'portfolio_scope': portfolioScope,
                'figi': figi,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Применить сырой ответ внешней нейросети по позициям портфеля
     * Парсит JSON (instruments[]), сохраняет строки в portfolio_position_recommendations.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static postManualApplyApiV1PortfolioAnalysisManualApplyPost({
requestBody,
}: {
requestBody: PortfolioManualApplyBody,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/portfolio-analysis/manual/apply',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Вердикт BUY/SELL/HOLD по позициям портфеля (LLM или fallback)
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static postVerdictApiV1PortfolioAnalysisVerdictPost({
requestBody,
}: {
requestBody: VerdictRequest,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/portfolio-analysis/verdict',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Фоновый прогон анализа по всем портфелям (real + виртуальные)
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static postRunApiV1PortfolioAnalysisRunPost(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/portfolio-analysis/run',
        });
    }

    /**
     * Последние сохранённые вердикты по FIGI (в пределах scope)
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getLatestApiV1PortfolioAnalysisLatestGet({
portfolioScope,
limit = 100,
}: {
/**
 * real или virtual:moderate и т.д.
 */
portfolioScope: string,
limit?: number,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio-analysis/latest',
            query: {
                'portfolio_scope': portfolioScope,
                'limit': limit,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Текущие позиции scope + последний сохранённый вердикт
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getPositionsApiV1PortfolioAnalysisPositionsGet({
portfolioScope,
}: {
portfolioScope: string,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio-analysis/positions',
            query: {
                'portfolio_scope': portfolioScope,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
