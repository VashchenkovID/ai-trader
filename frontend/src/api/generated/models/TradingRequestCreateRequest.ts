/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { TradingRequestCreateOptions } from './TradingRequestCreateOptions';

/**
 * Тело запроса создания заявки.
 */
export type TradingRequestCreateRequest = {
    /**
     * FIGI рекомендации в БД
     */
    recommendationFigi?: (string | null);
    /**
     * Данные рекомендации напрямую (если нет в БД)
     */
    recommendationData?: (Record<string, any> | null);
    /**
     * Опции создания
     */
    options?: TradingRequestCreateOptions;
};
