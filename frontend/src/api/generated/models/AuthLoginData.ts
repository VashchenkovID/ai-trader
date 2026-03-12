/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { UserDTO } from './UserDTO';

export type AuthLoginData = {
    /**
     * Обязательное поле: JWT токен доступа
     */
    token: string;
    /**
     * Обязательное поле: профиль авторизованного пользователя
     */
    user: UserDTO;
};
