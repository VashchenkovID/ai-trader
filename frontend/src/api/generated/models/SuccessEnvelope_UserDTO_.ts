/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { UserDTO } from './UserDTO';

export type SuccessEnvelope_UserDTO_ = {
    /**
     * Флаг успешного ответа
     */
    success?: boolean;
    /**
     * Обязательное поле: полезная нагрузка ответа
     */
    data: UserDTO;
};
