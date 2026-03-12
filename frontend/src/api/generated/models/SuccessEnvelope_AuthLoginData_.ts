/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { AuthLoginData } from './AuthLoginData';

export type SuccessEnvelope_AuthLoginData_ = {
    /**
     * Флаг успешного ответа
     */
    success?: boolean;
    /**
     * Обязательное поле: полезная нагрузка ответа
     */
    data: AuthLoginData;
};
