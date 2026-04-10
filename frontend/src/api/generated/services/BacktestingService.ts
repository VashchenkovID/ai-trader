/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SmaBacktestRequest } from '../models/SmaBacktestRequest';
import type { SuccessEnvelope_dict_ } from '../models/SuccessEnvelope_dict_';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class BacktestingService {

    /**
     * Бэктест SMA-кросс по FIGI
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static postSmaBacktestApiV1BacktestingSmaPost({
requestBody,
}: {
requestBody: SmaBacktestRequest,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/backtesting/sma',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Сохранённый бэктест по id
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getBacktestRunApiV1BacktestingRunsRunIdGet({
runId,
}: {
runId: string,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/backtesting/runs/{run_id}',
            path: {
                'run_id': runId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
