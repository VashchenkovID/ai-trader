import Asset from '../models/Asset.js';
import CachedInstrument from '../models/CachedInstrument.js';
import TinkoffApiService from './TinkoffApiService.js';
import LoggerService from './LoggerService.js';

/**
 * Сервис для синхронизации активов из Tinkoff API
 * Сохраняет все российские активы в таблицу assets для быстрого поиска asset_uid
 */
class AssetSyncService {
    constructor() {
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            this.isInitialized = true;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Failed to initialize AssetSyncService', {
                    service: 'AssetSyncService',
                    error: {message: error.message, stack: error.stack}
                });
            }
            throw error;
        }
    }

    /**
     * Получение списка FIGI наших инструментов из БД
     * @returns {Promise<Set<string>>} - Множество FIGI наших инструментов
     */
    async getOurInstrumentsFigi() {
        try {
            const instruments = await CachedInstrument.findAll({
                where: {
                    isActive: true
                },
                attributes: ['figi']
            });

            const figiSet = new Set(instruments.map(inst => inst.figi).filter(Boolean));

            return figiSet;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error getting our instruments FIGI', {
                    service: 'AssetSyncService',
                    error: {message: error.message}
                });
            }
            return new Set();
        }
    }

    /**
     * Синхронизация российских акций
     * Фильтрует активы: сохраняет только те, у которых есть инструменты (FIGI) из нашей БД
     * @param {boolean} forceUpdate - Принудительное обновление всех записей
     * @returns {Promise<Object>} - Статистика синхронизации
     */
    async syncRussianShares(forceUpdate = false) {
        try {
            // Получаем список наших FIGI из БД
            const ourFigiSet = await this.getOurInstrumentsFigi();

            if (ourFigiSet.size === 0) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('No active instruments found in database. Sync will be skipped.', {
                        service: 'AssetSyncService'
                    });
                }
                return {synced: 0, created: 0, updated: 0, errors: 0, filtered: 0};
            }

            // Получаем все российские акции
            const assets = await TinkoffApiService.getAssets({
                instrumentType: 'INSTRUMENT_TYPE_SHARE',
                instrumentStatus: 'INSTRUMENT_STATUS_BASE'
            });

            if (!assets || assets.length === 0) {
                if (LoggerService.isInitialized) {
                    LoggerService.warn('No assets received from API', {service: 'AssetSyncService'});
                }
                return {synced: 0, created: 0, updated: 0, errors: 0, filtered: 0};
            }

            let created = 0;
            let updated = 0;
            let errors = 0;
            let filtered = 0;

            // Фильтруем активы: оставляем только те, у которых есть инструменты из нашей БД
            const filteredAssets = assets.filter(asset => {
                // Проверяем, есть ли в активе инструменты с FIGI из нашей БД
                // Структура: asset.instruments - массив объектов с полем figi
                const instruments = asset.instruments || [];

                if (!Array.isArray(instruments) || instruments.length === 0) {
                    filtered++;
                    return false;
                }

                // Проверяем, есть ли хотя бы один инструмент с FIGI из нашей БД
                const hasOurInstrument = instruments.some(instrument => {
                    const figi = instrument?.figi || instrument?.FIGI;
                    return figi && ourFigiSet.has(figi);
                });

                if (!hasOurInstrument) {
                    filtered++;
                    return false;
                }

                return true;
            });

            // Собираем UID отфильтрованных активов для очистки старых
            const validAssetUids = new Set(filteredAssets.map(a => a.uid).filter(Boolean));

            // Удаляем активы, которые не соответствуют нашим инструментам
            // Проверяем все активы в БД и удаляем те, у которых нет инструментов из нашей БД
            let cleanedCount = 0;

            // Получаем все активы из БД для проверки
            const allAssetsInDb = await Asset.findAll({
                attributes: ['uid', 'apiData']
            });

            const assetsToDelete = [];

            for (const dbAsset of allAssetsInDb) {
                // Если актив есть в списке валидных (только что синхронизированных), пропускаем
                if (validAssetUids.has(dbAsset.uid)) {
                    continue;
                }

                // Проверяем, есть ли в активе инструменты из нашей БД
                if (!dbAsset.apiData) {
                    // Если нет apiData, помечаем на удаление
                    assetsToDelete.push(dbAsset.uid);
                    continue;
                }

                const instruments = dbAsset.apiData.instruments || [];
                if (!Array.isArray(instruments) || instruments.length === 0) {
                    // Если нет инструментов, помечаем на удаление
                    assetsToDelete.push(dbAsset.uid);
                    continue;
                }

                // Проверяем, есть ли хотя бы один инструмент с FIGI из нашей БД
                const hasOurInstrument = instruments.some(instrument => {
                    const figi = instrument?.figi || instrument?.FIGI;
                    return figi && ourFigiSet.has(figi);
                });

                if (!hasOurInstrument) {
                    // Если нет наших инструментов, помечаем на удаление
                    assetsToDelete.push(dbAsset.uid);
                }
            }

            // Удаляем все неактуальные активы одним запросом
            if (assetsToDelete.length > 0) {
                cleanedCount = await Asset.destroy({
                    where: {
                        uid: {
                            [Op.in]: assetsToDelete
                        }
                    }
                });
            }
            // Сохраняем каждый отфильтрованный актив
            for (const assetData of filteredAssets) {
                try {
                    if (!assetData.uid) {
                        continue; // Пропускаем активы без UID
                    }

                    const [asset, createdFlag] = await Asset.findOrCreate({
                        where: {uid: assetData.uid},
                        defaults: {
                            uid: assetData.uid,
                            name: assetData.name || null,
                            apiData: assetData
                        }
                    });

                    if (createdFlag) {
                        created++;
                    } else {
                        // Обновляем существующий актив, если forceUpdate или данные изменились
                        if (forceUpdate || !asset.updatedAt ||
                            (new Date() - new Date(asset.updatedAt)) > 7 * 24 * 60 * 60 * 1000) { // Обновляем раз в неделю
                            await asset.update({
                                name: assetData.name || asset.name,
                                apiData: assetData
                            });
                            updated++;
                        }
                    }
                } catch (error) {
                    errors++;
                    if (LoggerService.isInitialized) {
                        LoggerService.error('Error syncing asset', {
                            service: 'AssetSyncService',
                            uid: assetData.uid,
                            error: {message: error.message}
                        });
                    }
                }
            }

            const result = {
                synced: filteredAssets.length,
                created,
                updated,
                errors,
                filtered,
                cleaned: cleanedCount || 0
            };
            return result;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error syncing Russian shares', {
                    service: 'AssetSyncService',
                    error: {message: error.message, stack: error.stack}
                });
            }
            throw error;
        }
    }

    /**
     * Получение asset_uid по FIGI из таблицы assets
     * Находит актив, в котором в массиве apiData.instruments есть инструмент с нужным FIGI
     * Возвращает uid актива (не инструмента!)
     * @param {string} figi - FIGI инструмента
     * @returns {Promise<string|null>} - UID актива или null
     */
    async getAssetUidByFigi(figi) {
        try {
            // Используем JSONB запрос для поиска актива, содержащего инструмент с нужным FIGI
            const result = await Asset.sequelize.query(`
                SELECT 
                    assets.uid as asset_uid
                FROM assets,
                LATERAL jsonb_array_elements(
                    CASE 
                        WHEN jsonb_typeof(assets."apiData"->'instruments') = 'array' 
                        THEN assets."apiData"->'instruments'
                        WHEN assets."apiData"->'instrument' IS NOT NULL 
                        THEN jsonb_build_array(assets."apiData"->'instrument')
                        ELSE '[]'::jsonb
                    END
                ) AS instrument
                WHERE 
                    assets."apiData" IS NOT NULL 
                    AND (
                        instrument->>'figi' = :figi 
                        OR instrument->>'FIGI' = :figi
                    )
                LIMIT 1;
            `, {
                replacements: {figi},
                type: Asset.sequelize.QueryTypes.SELECT
            });

            return result?.length > 0 && result?.[0]?.asset_uid ? result?.[0]?.asset_uid : null;
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error getting asset UID by FIGI', {
                    service: 'AssetSyncService',
                    figi,
                    error: {message: error.message}
                });
            }
            return null;
        }
    }

    /**
     * Получение статистики по активам в БД
     * @returns {Promise<Object>} - Статистика
     */
    async getStats() {
        try {
            const total = await Asset.count();

            // Подсчитываем типы инструментов из apiData
            const assets = await Asset.findAll({
                attributes: ['apiData']
            });

            const byType = {};
            assets.forEach(asset => {
                if (asset.apiData?.instrumentType) {
                    const type = asset.apiData.instrumentType;
                    byType[type] = (byType[type] || 0) + 1;
                } else {
                    byType['unknown'] = (byType['unknown'] || 0) + 1;
                }
            });

            return {
                total,
                byType
            };
        } catch (error) {
            if (LoggerService.isInitialized) {
                LoggerService.error('Error getting asset stats', {
                    service: 'AssetSyncService',
                    error: {message: error.message}
                });
            }
            return {total: 0, byType: {}};
        }
    }
}

const assetSyncService = new AssetSyncService();
export default assetSyncService;

