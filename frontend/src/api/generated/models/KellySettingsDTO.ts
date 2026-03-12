/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type KellySettingsDTO = {
    /**
     * Необязательное поле: включен ли расчет по формуле Келли
     */
    enabled?: boolean;
    /**
     * Необязательное поле: консервативный коэффициент
     */
    conservativeFactor?: number;
    /**
     * Необязательное поле: минимальное число сделок
     */
    minTrades?: number;
    /**
     * Необязательное поле: период волатильности в днях
     */
    volatilityPeriod?: number;
};
