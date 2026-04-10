/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SuccessEnvelope_dict_ } from '../models/SuccessEnvelope_dict_';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class PortfolioMigrationService {

    /**
     * Статус поддержки миграции портфеля
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static portfolioMigrationStatusApiV1PortfolioMigrationStatusGet(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio-migration/status',
        });
    }

    /**
     * Запуск миграции (зарезервировано)
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static portfolioMigrationStartApiV1PortfolioMigrationStartPost(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/portfolio-migration/start',
        });
    }

}
