/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SuccessEnvelope_dict_str__Any__ } from '../models/SuccessEnvelope_dict_str__Any__';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class TinkoffService {

    /**
     * Accounts
     * @returns SuccessEnvelope_dict_str__Any__ Successful Response
     * @throws ApiError
     */
    public static accountsApiV1TinkoffAccountsGet(): CancelablePromise<SuccessEnvelope_dict_str__Any__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/tinkoff/accounts',
        });
    }

    /**
     * User Info
     * @returns SuccessEnvelope_dict_str__Any__ Successful Response
     * @throws ApiError
     */
    public static userInfoApiV1TinkoffUserInfoGet(): CancelablePromise<SuccessEnvelope_dict_str__Any__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/tinkoff/user-info',
        });
    }

    /**
     * Operations
     * @returns SuccessEnvelope_dict_str__Any__ Successful Response
     * @throws ApiError
     */
    public static operationsApiV1TinkoffOperationsGet({
fromTs,
toTs,
state = 'OPERATION_STATE_EXECUTED',
accountId,
}: {
fromTs?: (string | null),
toTs?: (string | null),
state?: string,
accountId?: (string | null),
}): CancelablePromise<SuccessEnvelope_dict_str__Any__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/tinkoff/operations',
            query: {
                'from_ts': fromTs,
                'to_ts': toTs,
                'state': state,
                'account_id': accountId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Currencies
     * @returns SuccessEnvelope_dict_str__Any__ Successful Response
     * @throws ApiError
     */
    public static currenciesApiV1TinkoffInstrumentsCurrenciesGet(): CancelablePromise<SuccessEnvelope_dict_str__Any__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/tinkoff/instruments/currencies',
        });
    }

    /**
     * Bonds
     * @returns SuccessEnvelope_dict_str__Any__ Successful Response
     * @throws ApiError
     */
    public static bondsApiV1TinkoffInstrumentsBondsGet(): CancelablePromise<SuccessEnvelope_dict_str__Any__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/tinkoff/instruments/bonds',
        });
    }

    /**
     * Etfs
     * @returns SuccessEnvelope_dict_str__Any__ Successful Response
     * @throws ApiError
     */
    public static etfsApiV1TinkoffInstrumentsEtfsGet(): CancelablePromise<SuccessEnvelope_dict_str__Any__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/tinkoff/instruments/etfs',
        });
    }

    /**
     * Dividends
     * @returns SuccessEnvelope_dict_str__Any__ Successful Response
     * @throws ApiError
     */
    public static dividendsApiV1TinkoffInstrumentsDividendsFigiGet({
figi,
}: {
figi: string,
}): CancelablePromise<SuccessEnvelope_dict_str__Any__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/tinkoff/instruments/dividends/{figi}',
            path: {
                'figi': figi,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Find Instrument
     * @returns SuccessEnvelope_dict_str__Any__ Successful Response
     * @throws ApiError
     */
    public static findInstrumentApiV1TinkoffInstrumentsFindGet({
query,
}: {
query: string,
}): CancelablePromise<SuccessEnvelope_dict_str__Any__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/tinkoff/instruments/find',
            query: {
                'query': query,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Trading Status
     * @returns SuccessEnvelope_dict_str__Any__ Successful Response
     * @throws ApiError
     */
    public static tradingStatusApiV1TinkoffTradingStatusFigiGet({
figi,
}: {
figi: string,
}): CancelablePromise<SuccessEnvelope_dict_str__Any__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/tinkoff/trading-status/{figi}',
            path: {
                'figi': figi,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
