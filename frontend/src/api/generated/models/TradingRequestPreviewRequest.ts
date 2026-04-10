/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { TradingRequestCreateOptions } from './TradingRequestCreateOptions';

/**
 * Предрасчёт заявки без записи в БД (те же поля, что у создания).
 */
export type TradingRequestPreviewRequest = {
    /**
     * FIGI рекомендации в БД
     */
    recommendationFigi?: (string | null);
    /**
     * Данные рекомендации напрямую (если нет строки в БД)
     */
    recommendationData?: (Record<string, any> | null);
    /**
     * Опции (action, mode, quantity)
     */
    options?: TradingRequestCreateOptions;
};
