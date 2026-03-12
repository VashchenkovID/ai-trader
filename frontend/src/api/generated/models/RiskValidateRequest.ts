/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type RiskValidateRequest = {
    /**
     * FIGI инструмента
     */
    figi: string;
    /**
     * BUY или SELL
     */
    action: string;
    quantity: number;
    price: (number | string);
    confidence: number;
    score: number;
    /**
     * Стоимость портфеля
     */
    portfolioValue?: (number | string);
    /**
     * Текущая экспозиция
     */
    currentExposure?: (number | string);
};
