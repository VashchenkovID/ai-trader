/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type VerdictRequest = {
    /**
     * real или virtual:{conservative|moderate|aggressive|experimental}
     */
    portfolio_scope: string;
    /**
     * Опционально ограничить список FIGI
     */
    figis?: (Array<string> | null);
};
