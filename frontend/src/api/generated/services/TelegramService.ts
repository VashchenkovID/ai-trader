/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { NotificationSettingsBody } from '../models/NotificationSettingsBody';
import type { SuccessEnvelope_dict_str__Any__ } from '../models/SuccessEnvelope_dict_str__Any__';
import type { TelegramAlertBody } from '../models/TelegramAlertBody';
import type { TelegramMessageBody } from '../models/TelegramMessageBody';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class TelegramService {

    /**
     * Статус Telegram подсистемы
     * @returns SuccessEnvelope_dict_str__Any__ Successful Response
     * @throws ApiError
     */
    public static telegramStatusApiV1TelegramStatusGet(): CancelablePromise<SuccessEnvelope_dict_str__Any__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/telegram/status',
        });
    }

    /**
     * Проверка соединения с Telegram bot API
     * @returns SuccessEnvelope_dict_str__Any__ Successful Response
     * @throws ApiError
     */
    public static telegramTestApiV1TelegramTestPost(): CancelablePromise<SuccessEnvelope_dict_str__Any__> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/telegram/test',
        });
    }

    /**
     * Отправка произвольного сообщения в Telegram
     * @returns SuccessEnvelope_dict_str__Any__ Successful Response
     * @throws ApiError
     */
    public static telegramSendApiV1TelegramSendPost({
requestBody,
}: {
requestBody: TelegramMessageBody,
}): CancelablePromise<SuccessEnvelope_dict_str__Any__> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/telegram/send',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Отправка системного алерта в Telegram
     * @returns SuccessEnvelope_dict_str__Any__ Successful Response
     * @throws ApiError
     */
    public static telegramSystemAlertApiV1TelegramAlertsSystemPost({
requestBody,
}: {
requestBody: TelegramAlertBody,
}): CancelablePromise<SuccessEnvelope_dict_str__Any__> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/telegram/alerts/system',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Настройки telegram-уведомлений (DB)
     * @returns SuccessEnvelope_dict_str__Any__ Successful Response
     * @throws ApiError
     */
    public static notificationsGetSettingsApiV1NotificationsSettingsGet(): CancelablePromise<SuccessEnvelope_dict_str__Any__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/notifications/settings',
        });
    }

    /**
     * Сохранить настройки telegram-уведомлений (DB)
     * @returns SuccessEnvelope_dict_str__Any__ Successful Response
     * @throws ApiError
     */
    public static notificationsSetSettingsApiV1NotificationsSettingsPost({
requestBody,
}: {
requestBody: NotificationSettingsBody,
}): CancelablePromise<SuccessEnvelope_dict_str__Any__> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/notifications/settings',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
