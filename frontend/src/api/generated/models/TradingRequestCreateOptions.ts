/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Опции при создании заявки из рекомендации.
 */
export type TradingRequestCreateOptions = {
    /**
     * Переопределить action (BUY/SELL)
     */
    action?: (string | null);
    /**
     * Режим торговли
     */
    mode?: string;
    /**
     * Переопределить количество
     */
    quantity?: (number | null);
    /**
     * Профиль виртуального портфеля: conservative|moderate|aggressive|experimental
     */
    virtualProfile?: (string | null);
};
