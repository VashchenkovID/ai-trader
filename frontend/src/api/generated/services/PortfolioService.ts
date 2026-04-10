/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SuccessEnvelope_dict_ } from '../models/SuccessEnvelope_dict_';
import type { SuccessEnvelope_dict_str__object__ } from '../models/SuccessEnvelope_dict_str__object__';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class PortfolioService {

    /**
     * Портфель (реальный счёт Tinkoff)
     * Возвращает данные реального портфеля из Tinkoff Invest API.
 * Контракт: cash, positions, totalValue, positionsValue (совместим с performRealPortfolioSync).
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getPortfolioApiV1PortfolioGet(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio/',
        });
    }

    /**
     * Портфель (реальный счёт Tinkoff)
     * Возвращает данные реального портфеля из Tinkoff Invest API.
 * Контракт: cash, positions, totalValue, positionsValue (совместим с performRealPortfolioSync).
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getPortfolioApiV1PortfolioGet1(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio',
        });
    }

    /**
     * Снимок реального портфеля из БД (после scheduler / portfolio sync)
     * Данные из `real_portfolio` (id=1), записываемые задачей `_portfolio_sync_job`.
 * Контракт рядом с live GET /portfolio: cash, positions, totalValue, positionsValue + meta.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getRealPortfolioDbSnapshotApiV1PortfolioRealDbGet(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio/real/db',
        });
    }

    /**
     * Рекомендации по FIGI позиций портфеля (пакетно из БД)
     * Последние рекомендации (BUY/SELL/HOLD) по списку FIGI — для таблицы на странице портфеля.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getPortfolioPositionRecommendationsApiV1PortfolioPositionRecommendationsGet({
figi,
}: {
/**
 * Повторяющийся query-параметр: figi=TCS123&figi=...
 */
figi?: Array<string>,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio/position-recommendations',
            query: {
                'figi': figi,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Виртуальный портфель (paper, из БД)
     * Снимок виртуального портфеля: тот же контракт, что у реального таба + isVirtual.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getVirtualPortfolioApiV1PortfolioVirtualGet({
profile,
includeTrades = false,
}: {
/**
 * Профиль: conservative|moderate|aggressive|experimental (по умолчанию moderate)
 */
profile?: (string | null),
/**
 * Добавить последние сделки в ответ (до 200 записей)
 */
includeTrades?: boolean,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio/virtual',
            query: {
                'profile': profile,
                'include_trades': includeTrades,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Виртуальный портфель с сделками (alias include_trades=true)
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getVirtualPortfolioDetailApiV1PortfolioVirtualDetailGet({
profile,
}: {
/**
 * Профиль: conservative|moderate|aggressive|experimental
 */
profile?: (string | null),
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio/virtual/detail',
            query: {
                'profile': profile,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * История NAV по профилю (для графиков)
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getVirtualNavHistoryApiV1PortfolioVirtualNavHistoryGet({
profile,
limitDays = 120,
}: {
/**
 * slug профиля
 */
profile?: (string | null),
limitDays?: number,
}): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio/virtual/nav-history',
            query: {
                'profile': profile,
                'limit_days': limitDays,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Сводка по всем виртуальным профилям
     * Карточки для дашборда: conservative / moderate / aggressive / experimental.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getVirtualPortfolioProfilesApiV1PortfolioVirtualProfilesGet(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio/virtual/profiles',
        });
    }

    /**
     * Эффективные пороги виртуальных профилей
     * Зеркало `portfolio.profiles` после merge с дефолтами (для UI / GitOps).
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static getVirtualProfilesConfigApiV1PortfolioVirtualProfilesConfigGet(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio/virtual/profiles-config',
        });
    }

    /**
     * Синхронизация портфеля (то же что GET /portfolio)
     * Явный запрос синхронизации портфеля — те же данные, что GET /portfolio.
     * @returns SuccessEnvelope_dict_ Successful Response
     * @throws ApiError
     */
    public static portfolioSyncApiV1PortfolioSyncGet(): CancelablePromise<SuccessEnvelope_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio/sync',
        });
    }

    /**
     * Фоновый sync портфеля
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static portfolioSyncTriggerApiV1PortfolioSyncPost(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/portfolio/sync',
        });
    }

    /**
     * Фоновый sync реального портфеля из Tinkoff
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static realPortfolioSyncTriggerApiV1PortfolioRealSyncPost(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/portfolio/real/sync',
        });
    }

    /**
     * Статус последнего sync портфеля
     * @returns SuccessEnvelope_dict_str__object__ Successful Response
     * @throws ApiError
     */
    public static portfolioSyncStatusApiV1PortfolioSyncStatusGet(): CancelablePromise<SuccessEnvelope_dict_str__object__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/portfolio/sync/status',
        });
    }

}
