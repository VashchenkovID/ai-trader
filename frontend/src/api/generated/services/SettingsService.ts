/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { KellySettingsUpdateRequest } from '../models/KellySettingsUpdateRequest';
import type { SettingsUpdateRequest } from '../models/SettingsUpdateRequest';
import type { SuccessEnvelope_dict_str__object__ } from '../models/SuccessEnvelope_dict_str__object__';
import type { SuccessEnvelope_KellySettingsDTO_ } from '../models/SuccessEnvelope_KellySettingsDTO_';
import type { SuccessEnvelope_SettingItemDTO_ } from '../models/SuccessEnvelope_SettingItemDTO_';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class SettingsService {

    /**
     * Список системных настроек
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static getSettingsApiV1SettingsGet({
offset,
limit = 200,
}: {
offset?: number,
limit?: number,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/settings',
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
     * Обновление настройки по ключу
     * @returns SuccessEnvelope_SettingItemDTO_ Successful Response
     * @throws ApiError
     */
    public static updateSettingsApiV1SettingsPut({
requestBody,
}: {
requestBody: SettingsUpdateRequest,
}): CancelablePromise<SuccessEnvelope_SettingItemDTO_> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/v1/settings',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Текущие параметры Келли
     * @returns SuccessEnvelope_KellySettingsDTO_ Successful Response
     * @throws ApiError
     */
    public static getKellySettingsApiV1SettingsKellyGet(): CancelablePromise<SuccessEnvelope_KellySettingsDTO_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/settings/kelly',
        });
    }

    /**
     * Обновление параметров Келли
     * @returns SuccessEnvelope_KellySettingsDTO_ Successful Response
     * @throws ApiError
     */
    public static updateKellySettingsApiV1SettingsKellyPut({
requestBody,
}: {
requestBody: KellySettingsUpdateRequest,
}): CancelablePromise<SuccessEnvelope_KellySettingsDTO_> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/v1/settings/kelly',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
