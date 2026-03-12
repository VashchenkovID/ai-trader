/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ReleaseGateBody } from '../models/ReleaseGateBody';
import type { RunJuryBody } from '../models/RunJuryBody';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class TrainingService {

    /**
     * Запустить обучение NN с conditioning
     * Ставит в очередь фоновую задачу обучения базового контура NN. Чекпоинты сохраняются в MLflow и TRAINING_ARTIFACTS_DIR. Требует установки зависимости [training].
     * @returns any Successful Response
     * @throws ApiError
     */
    public static runNnTrainingApiV1TrainingRunNnPost({
epochs = 20,
resumeFromLatest = false,
}: {
epochs?: number,
/**
 * Продолжить обучение с последнего чекпоинта
 */
resumeFromLatest?: boolean,
}): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/training/run-nn',
            query: {
                'epochs': epochs,
                'resume_from_latest': resumeFromLatest,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Запустить обучение NN по свечам из БД (FIGI)
     * Загружает свечи по FIGI из БД, преобразует в фичи и запускает обучение в executor.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static runNnFromFigiApiV1TrainingRunNnFromFigiPost({
figi,
epochs = 20,
lookbackDays = 60,
predictionHorizon = 5,
limit = 2000,
resumeFromLatest = false,
}: {
/**
 * FIGI инструмента
 */
figi: string,
epochs?: number,
lookbackDays?: number,
predictionHorizon?: number,
limit?: number,
/**
 * Продолжить обучение с последнего чекпоинта
 */
resumeFromLatest?: boolean,
}): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/training/run-nn-from-figi',
            query: {
                'figi': figi,
                'epochs': epochs,
                'lookback_days': lookbackDays,
                'prediction_horizon': predictionHorizon,
                'limit': limit,
                'resume_from_latest': resumeFromLatest,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Запланировать обучение NN в фоне
     * Добавляет задачу обучения в BackgroundTasks и сразу возвращает ответ. Результат обучения пишется в MLflow; для получения run_id смотрите логи приложения.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static scheduleNnTrainingApiV1TrainingRunNnBackgroundPost({
epochs = 20,
resumeFromLatest = false,
}: {
epochs?: number,
/**
 * Продолжить обучение с последнего чекпоинта
 */
resumeFromLatest?: boolean,
}): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/training/run-nn-background',
            query: {
                'epochs': epochs,
                'resume_from_latest': resumeFromLatest,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Запустить обучение Weekly forecast (LSTM)
     * Запускает обучение контура weekly в executor. Без FIGI используется синтетика. Чекпоинты в models_root/weekly/.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static runWeeklyTrainingApiV1TrainingRunWeeklyPost({
epochs = 20,
seqLen = 30,
nForecast = 5,
resumeFromLatest = false,
}: {
epochs?: number,
seqLen?: number,
nForecast?: number,
/**
 * Продолжить обучение с последнего weekly чекпоинта
 */
resumeFromLatest?: boolean,
}): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/training/run-weekly',
            query: {
                'epochs': epochs,
                'seq_len': seqLen,
                'n_forecast': nForecast,
                'resume_from_latest': resumeFromLatest,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Запустить обучение RL-агента (Q-learning)
     * Запускает табличный RL-контур (HOLD/BUY/SELL), сохраняет артефакт агента в models_root/rl.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static runRlTrainingApiV1TrainingRunRlPost({
totalSteps = 10000,
envName = 'paper',
continueFromLatest = false,
}: {
totalSteps?: number,
envName?: string,
/**
 * Продолжить RL-обучение с последнего агента
 */
continueFromLatest?: boolean,
}): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/training/run-rl',
            query: {
                'total_steps': totalSteps,
                'env_name': envName,
                'continue_from_latest': continueFromLatest,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Запустить обучение Weekly forecast по свечам из БД (FIGI)
     * Загружает свечи по FIGI из БД и запускает обучение LSTM в executor.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static runWeeklyFromFigiApiV1TrainingRunWeeklyFromFigiPost({
figi,
epochs = 20,
seqLen = 30,
nForecast = 5,
limit = 2000,
resumeFromLatest = false,
}: {
/**
 * FIGI инструмента
 */
figi: string,
epochs?: number,
seqLen?: number,
nForecast?: number,
limit?: number,
/**
 * Продолжить обучение с последнего weekly чекпоинта
 */
resumeFromLatest?: boolean,
}): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/training/run-weekly-from-figi',
            query: {
                'figi': figi,
                'epochs': epochs,
                'seq_len': seqLen,
                'n_forecast': nForecast,
                'limit': limit,
                'resume_from_latest': resumeFromLatest,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Запустить walk-forward бэктест по чекпоинту NN
     * Загружает данные (по FIGI из БД или синтетика), разбивает на n_splits окон, оценивает модель на каждом тестовом окне, возвращает средние метрики (test_mse, test_mae, test_direction_accuracy).
     * @returns any Successful Response
     * @throws ApiError
     */
    public static runBacktestApiV1TrainingRunBacktestPost({
checkpoint,
nSplits = 5,
figi,
limit = 2000,
}: {
/**
 * Путь к чекпоинту CondMLP (например ./models/python_nn/cond_mlp-xx.ckpt)
 */
checkpoint: string,
nSplits?: number,
/**
 * FIGI для загрузки свечей из БД; без указания — синтетика
 */
figi?: (string | null),
limit?: number,
}): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/training/run-backtest',
            query: {
                'checkpoint': checkpoint,
                'n_splits': nSplits,
                'figi': figi,
                'limit': limit,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Запустить обучение мета-модели стекинга поверх CondMLP
     * Загружает базовый чекпоинт CondMLP, строит мета-признаки из 9×2 предсказаний, обучает StackingModel, сохраняет чекпоинт в models_root/stacking/.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static runStackingApiV1TrainingRunStackingPost({
baseCheckpoint,
epochs = 20,
figi,
limit = 2000,
}: {
/**
 * Путь к чекпоинту CondMLP
 */
baseCheckpoint: string,
epochs?: number,
/**
 * FIGI для загрузки свечей из БД; без указания — синтетика
 */
figi?: (string | null),
limit?: number,
}): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/training/run-stacking',
            query: {
                'base_checkpoint': baseCheckpoint,
                'epochs': epochs,
                'figi': figi,
                'limit': limit,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Проверить release-gate и принять решение о промоуте модели
     * Сверяет метрики кандидата с порогами policy, возвращает approve/reject и список проваленных критериев.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static runReleaseGateApiV1TrainingReleaseGatePost({
requestBody,
}: {
requestBody: ReleaseGateBody,
}): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/training/release-gate',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Запустить LLM-жюри по FIGI и сохранить мнения в БД
     * Загружает инструмент и свечи из БД, вызывает всех провайдеров жюри, сохраняет мнения в llm_jury_opinions и агрегат в llm_jury_aggregates.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static runJuryEndpointApiV1TrainingRunJuryPost({
requestBody,
}: {
requestBody?: RunJuryBody,
}): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/training/run-jury',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
