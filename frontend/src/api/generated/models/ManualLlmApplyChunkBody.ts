/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Ручной импорт одного батча ответов GigaChat + Алиса (тот же промпт, два сырьих ответа).
 */
export type ManualLlmApplyChunkBody = {
    /**
     * Индекс чанка из GET prompt-chunk
     */
    chunkIndex: number;
    /**
     * FIGI в том же порядке, что вернул GET
     */
    figi: Array<string>;
    /**
     * Сырой ответ GigaChat
     */
    gigachatRaw: string;
    /**
     * Сырой ответ Алиса / YandexGPT
     */
    alisaRaw: string;
};
