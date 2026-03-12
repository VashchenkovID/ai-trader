/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type SettingItemDTO = {
    /**
     * Обязательное поле: ключ настройки
     */
    key: string;
    /**
     * Обязательное поле: текущее значение
     */
    value: any;
    /**
     * Необязательное поле: тип значения
     */
    type?: string;
    /**
     * Необязательное поле: модуль настройки
     */
    module?: string;
    /**
     * Необязательное поле: описание настройки
     */
    description?: string;
    /**
     * Необязательное поле: минимально допустимое значение
     */
    min?: (number | null);
    /**
     * Необязательное поле: максимально допустимое значение
     */
    max?: (number | null);
    /**
     * Необязательное поле: допустимые варианты
     */
    options?: null;
};
