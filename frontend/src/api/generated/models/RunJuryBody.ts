/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Тело запроса запуска жюри по FIGI.
 */
export type RunJuryBody = {
    /**
     * Один FIGI инструмента
     */
    figi?: (string | null);
    /**
     * Список FIGI для пакетного запуска
     */
    figi_list?: (Array<string> | null);
};
