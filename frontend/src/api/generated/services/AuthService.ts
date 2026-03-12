/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AuthLoginRequest } from '../models/AuthLoginRequest';
import type { SuccessEnvelope_AuthLoginData_ } from '../models/SuccessEnvelope_AuthLoginData_';
import type { SuccessEnvelope_dict_str__object__ } from '../models/SuccessEnvelope_dict_str__object__';
import type { SuccessEnvelope_dict_str__str__ } from '../models/SuccessEnvelope_dict_str__str__';
import type { SuccessEnvelope_UserDTO_ } from '../models/SuccessEnvelope_UserDTO_';
import type { VerifyTokenRequest } from '../models/VerifyTokenRequest';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class AuthService {

    /**
     * Вход пользователя
     * @returns SuccessEnvelope_AuthLoginData_ Successful Response
     * @throws ApiError
     */
    public static loginApiV1AuthLoginPost({
requestBody,
}: {
requestBody: AuthLoginRequest,
}): CancelablePromise<SuccessEnvelope_AuthLoginData_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/auth/login',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Текущий пользователь
     * @returns SuccessEnvelope_UserDTO_ Successful Response
     * @throws ApiError
     */
    public static meApiV1AuthMeGet({
authorization,
}: {
authorization?: (string | null),
}): CancelablePromise<SuccessEnvelope_UserDTO_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/auth/me',
            headers: {
                'authorization': authorization,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Проверка токена
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static verifyApiV1AuthVerifyPost({
requestBody,
}: {
requestBody: VerifyTokenRequest,
}): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/auth/verify',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Выход пользователя
     * @returns SuccessEnvelope_dict_str__str__ Successful Response
     * @throws ApiError
     */
    public static logoutApiV1AuthLogoutPost({
authorization,
}: {
authorization?: (string | null),
}): CancelablePromise<SuccessEnvelope_dict_str__str__> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/auth/logout',
            headers: {
                'authorization': authorization,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
