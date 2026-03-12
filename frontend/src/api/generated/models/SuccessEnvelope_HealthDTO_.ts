/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { HealthDTO } from './HealthDTO';

export type SuccessEnvelope_HealthDTO_ = {
    /**
     * Флаг успешного ответа
     */
    success?: boolean;
    /**
     * Обязательное поле: полезная нагрузка ответа
     */
    data: HealthDTO;
};
