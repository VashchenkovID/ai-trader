/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type KellySettingsUpdateRequest = {
    /**
     * Включение/выключение расчета Келли
     */
    enabled?: (boolean | null);
    /**
     * Новое значение консервативного коэффициента
     */
    conservativeFactor?: (number | null);
    /**
     * Новое минимальное число сделок
     */
    minTrades?: (number | null);
    /**
     * Новый период волатильности в днях
     */
    volatilityPeriod?: (number | null);
};
