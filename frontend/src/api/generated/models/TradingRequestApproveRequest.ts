/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type TradingRequestApproveRequest = {
    /**
     * Комментарий к одобрению
     */
    comment?: (string | null);
    /**
     * Режим real: одобрить без API-ордера; исполнение в T‑Invest вручную, затем «Исполнить»
     */
    manualBrokerExecution?: boolean;
};
