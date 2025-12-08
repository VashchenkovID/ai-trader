/**
 * Утилита для перевода статусов рекомендаций на русский язык
 */

const recommendationTranslations: Record<string, string> = {
  'BUY': 'ПОКУПКА',
  'buy': 'ПОКУПКА',
  'SELL': 'ПРОДАЖА',
  'sell': 'ПРОДАЖА',
  'HOLD': 'ДЕРЖАТЬ',
  'hold': 'ДЕРЖАТЬ',
  'ПОКУПКА': 'ПОКУПКА',
  'ПРОДАЖА': 'ПРОДАЖА',
  'ДЕРЖАТЬ': 'ДЕРЖАТЬ'
};

/**
 * Переводит статус рекомендации на русский язык
 * @param recommendation - Статус рекомендации (BUY/SELL/HOLD)
 * @returns Русский перевод статуса
 */
export function translateRecommendation(recommendation: string | null | undefined): string {
  if (!recommendation) {
    return 'ДЕРЖАТЬ';
  }
  
  const trimmed = recommendation.trim().toUpperCase();
  
  // Прямой поиск
  if (recommendationTranslations[trimmed]) {
    return recommendationTranslations[trimmed];
  }
  
  // Поиск без учета регистра
  const foundKey = Object.keys(recommendationTranslations).find(
    key => key.toUpperCase() === trimmed
  );
  
  if (foundKey) {
    return recommendationTranslations[foundKey];
  }
  
  // Если не найдено, возвращаем оригинал в верхнем регистре
  return trimmed || 'ДЕРЖАТЬ';
}

/**
 * Получить все доступные переводы рекомендаций
 */
export function getAvailableRecommendations(): string[] {
  return ['ПОКУПКА', 'ПРОДАЖА', 'ДЕРЖАТЬ'];
}

export default translateRecommendation;

