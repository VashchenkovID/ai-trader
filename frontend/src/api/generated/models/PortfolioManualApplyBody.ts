/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Ручной импорт ответа внешней нейросети по позициям портфеля (тот же промпт, один сырой ответ).
 */
export type PortfolioManualApplyBody = {
    portfolio_scope: string;
    /**
     * FIGI в том же порядке, что вернул GET manual/prompt
     */
    figi: Array<string>;
    /**
     * Сырой текст ответа (JSON с instruments[])
     */
    external_raw: string;
};
