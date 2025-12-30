/**
 * Утилиты для работы с моделью Блэка-Шоулза
 * Используется для вычисления Implied Volatility (IV) из опционов
 */

/**
 * Вычисление нормального распределения (CDF - Cumulative Distribution Function)
 * Аппроксимация функции нормального распределения
 */
function normalCDF(x) {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2.0);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
}

/**
 * Вычисление плотности вероятности нормального распределения (PDF)
 */
function normalPDF(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Цена опциона по модели Блэка-Шоулза
 * @param {number} S - Текущая цена базового актива
 * @param {number} K - Цена страйка
 * @param {number} T - Время до экспирации в годах
 * @param {number} r - Безрисковая процентная ставка (в десятичном виде, например 0.1 для 10%)
 * @param {number} sigma - Волатильность (в десятичном виде, например 0.2 для 20%)
 * @param {string} optionType - Тип опциона: 'call' или 'put'
 * @returns {number} - Цена опциона
 */
export function blackScholesPrice(S, K, T, r, sigma, optionType = 'call') {
    if (T <= 0) {
        return optionType === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
    }

    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    if (optionType === 'call') {
        return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
    } else {
        return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
    }
}

/**
 * Вычисление Implied Volatility (IV) через метод Ньютона-Рафсона
 * @param {number} marketPrice - Рыночная цена опциона
 * @param {number} S - Текущая цена базового актива
 * @param {number} K - Цена страйка
 * @param {number} T - Время до экспирации в годах
 * @param {number} r - Безрисковая процентная ставка (в десятичном виде)
 * @param {string} optionType - Тип опциона: 'call' или 'put'
 * @param {Object} options - Дополнительные опции
 * @param {number} options.maxIterations - Максимальное количество итераций (по умолчанию 100)
 * @param {number} options.precision - Точность вычисления (по умолчанию 0.0001)
 * @param {number} options.initialGuess - Начальное предположение о волатильности (по умолчанию 0.2)
 * @returns {number|null} - Подразумеваемая волатильность в десятичном виде (null если не удалось вычислить)
 */
export function calculateImpliedVolatility(
    marketPrice,
    S,
    K,
    T,
    r,
    optionType = 'call',
    options = {}
) {
    const {
        maxIterations = 100,
        precision = 0.0001,
        initialGuess = 0.2
    } = options;

    // Валидация входных данных
    if (T <= 0) {
        return null; // Опцион уже истек
    }

    if (marketPrice <= 0) {
        return null; // Некорректная цена опциона
    }

    if (S <= 0 || K <= 0) {
        return null; // Некорректные цены
    }

    // Минимальная и максимальная цена опциона для проверки
    const minPrice = optionType === 'call' 
        ? Math.max(S - K * Math.exp(-r * T), 0)
        : Math.max(K * Math.exp(-r * T) - S, 0);
    const maxPrice = optionType === 'call' ? S : K * Math.exp(-r * T);

    if (marketPrice < minPrice || marketPrice > maxPrice) {
        // Рыночная цена вне теоретических границ
        return null;
    }

    // Метод Ньютона-Рафсона для поиска IV
    let sigma = initialGuess;
    
    for (let i = 0; i < maxIterations; i++) {
        // Вычисляем цену опциона с текущей волатильностью
        const price = blackScholesPrice(S, K, T, r, sigma, optionType);
        
        // Разница между рыночной и вычисленной ценой
        const priceDiff = marketPrice - price;
        
        // Если разница достаточно мала, возвращаем результат
        if (Math.abs(priceDiff) < precision) {
            return sigma;
        }

        // Вычисляем Vega (производная цены по волатильности)
        const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
        const vega = S * normalPDF(d1) * Math.sqrt(T);

        // Если Vega слишком мала, прекращаем вычисления
        if (Math.abs(vega) < precision) {
            break;
        }

        // Обновляем волатильность по методу Ньютона-Рафсона
        const newSigma = sigma + priceDiff / vega;

        // Ограничиваем волатильность разумными пределами (0.001 - 5.0)
        if (newSigma <= 0.001) {
            sigma = 0.001;
            break;
        }
        if (newSigma >= 5.0) {
            sigma = 5.0;
            break;
        }

        // Если изменение слишком мало, возвращаем результат
        if (Math.abs(newSigma - sigma) < precision * 0.1) {
            sigma = newSigma;
            break;
        }

        sigma = newSigma;
    }

    // Проверяем финальную точность
    const finalPrice = blackScholesPrice(S, K, T, r, sigma, optionType);
    if (Math.abs(marketPrice - finalPrice) < precision * 10) {
        return sigma;
    }

    return null; // Не удалось найти IV с достаточной точностью
}

/**
 * Конвертация цены из формата Tinkoff API (units + nano) в число
 * @param {Object} priceObj - Объект с полями units и nano
 * @returns {number} - Цена в числовом виде
 */
export function convertPriceFromTinkoff(priceObj) {
    if (!priceObj) return null;
    if (typeof priceObj === 'number') return priceObj;
    
    const units = parseFloat(priceObj.units || 0);
    const nano = parseFloat(priceObj.nano || 0);
    
    return units + nano / 1e9;
}

/**
 * Вычисление времени до экспирации в годах
 * @param {Date} expirationDate - Дата экспирации
 * @param {Date} currentDate - Текущая дата (по умолчанию текущее время)
 * @returns {number} - Время в годах
 */
export function calculateTimeToExpiration(expirationDate, currentDate = new Date()) {
    const expiration = new Date(expirationDate);
    const current = new Date(currentDate);
    
    if (expiration <= current) {
        return 0;
    }
    
    // Вычисляем разницу в миллисекундах
    const diffMs = expiration - current;
    
    // Конвертируем в годы (365.25 дней для учета високосных лет)
    const daysPerYear = 365.25;
    const msPerDay = 24 * 60 * 60 * 1000;
    
    return (diffMs / msPerDay) / daysPerYear;
}

