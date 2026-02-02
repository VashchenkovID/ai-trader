/**
 * Переводчик типов воркеров на русский язык
 */

const workerTypeTranslations: { [key: string]: string } = {
  'quick-training': 'Быстрое обучение',
  // Обучение
  'training': 'Обучение модели',
  'optimized_training': 'Оптимизированное обучение',
  'optimizedTraining': 'Оптимизированное обучение',
  'standalone_training': 'Автономное обучение',
  'standaloneTraining': 'Автономное обучение',
  'ensemble_training': 'Обучение ансамбля',
  'ensembleTraining': 'Обучение ансамбля',
  'rl_training': 'Обучение с подкреплением',
  'rlTraining': 'Обучение с подкреплением',
  'meta_learning': 'Метаобучение',
  'metaLearning': 'Метаобучение',
  
  // Анализ
  'market_analysis': 'Анализ рынка',
  'marketAnalysis': 'Анализ рынка',
  'portfolio_analysis': 'Анализ портфеля',
  'portfolioAnalysis': 'Анализ портфеля',
  'analysis': 'Анализ',
  
  // Обновление данных
  'cache_update': 'Обновление кеша',
  'cache Update': 'Обновление кеша',
  'price_update': 'Обновление цен',
  'price Update': 'Обновление цен',
  'portfolio_prices_update': 'Обновление цен портфеля',
  'portfolio Prices Update': 'Обновление цен портфеля',
  'trading_requests_prices_update': 'Обновление цен заявок',
  'trading Requests Prices Update': 'Обновление цен заявок',
  'trading-requests-prices-update': 'Обновление цен заявок',
  'active_signals_prices_update': 'Обновление цен сигналов',
  'active Signals Prices Update': 'Обновление цен сигналов',
  'active-signals-prices-update': 'Обновление цен сигналов',
  'news-daily-update': 'Ежедневное обновление новостей',
  'news_cache_cleanup': 'Еженедельная очистка новостей',
  'news-cache-cleanup': 'Еженедельная очистка новостей',
  'telegram_cache_update': 'Обновление кеша Telegram',
  'telegram-cache-update': 'Обновление кеша Telegram',
  'options_data_update': 'Обновление опционов',
  'optionsDataUpdate': 'Обновление опционов',
  'options Data Update': 'Обновление опционов',
  'options_data_update_worker': 'Обновление опционов',
  
  // Фундаментальные и квартальные данные
  'fundamental_data_update': 'Обновление фундаментальных данных',
  'fundamentalDataUpdate': 'Обновление фундаментальных данных',
  'fundamental Data Update': 'Обновление фундаментальных данных',
  'quarterly_data_update': 'Обновление квартальных данных',
  'quarterlyDataUpdate': 'Обновление квартальных данных',
  'quarterly Data Update': 'Обновление квартальных данных',
  
  // Другие
  'neuralNetwork': 'Нейронная сеть',
  'neural_network': 'Нейронная сеть',
  'ensemble': 'Ансамбль',
  'portfolioRebalancing': 'Ребалансировка портфеля',
  'portfolio_rebalancing': 'Ребалансировка портфеля',
  'portfolio Rebalancing': 'Ребалансировка портфеля',
};

/**
 * Переводит тип воркера на русский язык
 * @param workerType - Тип воркера (например, 'training', 'market_analysis')
 * @returns Переведенное название типа воркера
 */
export function translateWorkerType(workerType: string | null | undefined): string {
  if (!workerType) {
    return 'Неизвестный тип';
  }

  // Проверяем точное совпадение
  if (workerTypeTranslations[workerType]) {
    return workerTypeTranslations[workerType];
  }

  // Проверяем совпадение без учета регистра
  const lowerType = workerType.toLowerCase();
  const found = Object.keys(workerTypeTranslations).find(
    key => key.toLowerCase() === lowerType
  );
  
  if (found) {
    return workerTypeTranslations[found];
  }

  // Если не найдено, пытаемся преобразовать формат
  // Например: "market_analysis" -> "Анализ рынка"
  const formatted = workerType
    .split(/[_-]/)
    .map(word => {
      const firstLetter = word.charAt(0).toUpperCase();
      const rest = word.slice(1).toLowerCase();
      return firstLetter + rest;
    })
    .join(' ');

  // Проверяем еще раз после форматирования
  const formattedLower = formatted.toLowerCase();
  const foundFormatted = Object.keys(workerTypeTranslations).find(
    key => key.toLowerCase().replace(/[_-]/g, ' ') === formattedLower
  );

  if (foundFormatted) {
    return workerTypeTranslations[foundFormatted];
  }

  // Если все еще не найдено, возвращаем отформатированную версию
  return formatted;
}

/**
 * Переводит имя воркера, если оно содержит тип воркера
 * @param workerName - Имя воркера
 * @returns Переведенное имя воркера
 */
export function translateWorkerName(workerName: string | null | undefined): string {
  if (!workerName) {
    return 'Неизвестный воркер';
  }

  // Если имя уже содержит переведенный тип, возвращаем как есть
  const translatedTypes = Object.values(workerTypeTranslations);
  if (translatedTypes.some(translated => workerName.includes(translated))) {
    return workerName;
  }

  // Пытаемся найти тип воркера в имени и заменить его
  for (const [type, translation] of Object.entries(workerTypeTranslations)) {
    const regex = new RegExp(type, 'gi');
    if (regex.test(workerName)) {
      return workerName.replace(regex, translation);
    }
  }

  // Если не найдено, возвращаем оригинальное имя
  return workerName;
}

export default translateWorkerType;

