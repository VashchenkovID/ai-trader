/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AnalyzeRequest } from '../models/AnalyzeRequest';
import type { SuccessEnvelope_dict_ } from '../models/SuccessEnvelope_dict_';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class PortfolioAnalyzerService {

    /**
     * Сгенерировать отчёт по виртуальным портфелям
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static postAnalyzeApiV1PortfolioAnalyzerAnalyzePost({
requestBody,
}: {
requestBody: AnalyzeRequest,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/portfolio-analyzer/analyze',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Последние отчёты
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static listReportsApiV1PortfolioAnalyzerReportsGet({
limit = 20,
}: {
limit?: number,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio-analyzer/reports',
            query: {
                'limit': limit,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Текст отчёта по id
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getReportApiV1PortfolioAnalyzerReportsReportIdGet({
reportId,
}: {
reportId: string,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio-analyzer/reports/{report_id}',
            path: {
                'report_id': reportId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
