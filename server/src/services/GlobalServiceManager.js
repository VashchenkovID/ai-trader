import ServiceManager from './ServiceManager.js';

// Глобальный экземпляр ServiceManager
let globalServiceManager = null;

/**
 * Получает глобальный экземпляр ServiceManager
 */
export function getGlobalServiceManager() {
    if (!globalServiceManager) {
        globalServiceManager = new ServiceManager();
    }
    return globalServiceManager;
}

/**
 * Устанавливает глобальный экземпляр ServiceManager
 */
export function setGlobalServiceManager(serviceManager) {
    globalServiceManager = serviceManager;
}

/**
 * Получает сервис из глобального ServiceManager
 */
export function getService(serviceName) {
    const manager = getGlobalServiceManager();
    return manager.getService(serviceName);
}

export default getGlobalServiceManager;
