/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Вход release-gate для решения о промоуте модели.
 */
export type ReleaseGateBody = {
    /**
     * Идентификатор или путь модели-кандидата
     */
    model_ref: string;
    /**
     * Количество сделок в OOS-проверке
     */
    trades: number;
    /**
     * Доля прибыльных сделок
     */
    win_rate: number;
    /**
     * Profit factor
     */
    profit_factor: number;
    /**
     * Sharpe ratio
     */
    sharpe: number;
    /**
     * Максимальная просадка (0..1)
     */
    max_drawdown: number;
    /**
     * Стабильность OOS-результатов (0..1)
     */
    consistency: number;
    /**
     * Сохранять решение в JSONL-реестр release-gate
     */
    persist?: boolean;
};
