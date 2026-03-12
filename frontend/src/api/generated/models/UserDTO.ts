/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type UserDTO = {
    /**
     * Обязательное поле: идентификатор пользователя
     */
    id: number;
    /**
     * Обязательное поле: логин пользователя
     */
    username: string;
    /**
     * Обязательное поле: полное имя пользователя
     */
    fullName: string;
    /**
     * Необязательное поле: время последнего входа
     */
    lastLogin?: (string | null);
};
