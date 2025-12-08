/**
 * Утилита для перевода числовых значений уверенности (confidence) и оценки (score) 
 * в понятные текстовые обозначения на русском языке
 */

/**
 * Переводит числовое значение уверенности/score в текстовое обозначение
 * @param value - Значение от 0 до 1 (или от 0 до 100)
 * @param type - Тип значения: 'confidence' (уверенность) или 'score' (оценка)
 * @returns Текстовое обозначение на русском
 */
export function translateConfidence(value: number | null | undefined, type: 'confidence' | 'score' = 'confidence'): string {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
    return 'Неизвестно';
  }

  // Нормализуем значение к диапазону 0-1
  let normalizedValue = value;
  if (value > 1) {
    normalizedValue = value / 100;
  }

  // Ограничиваем диапазон
  normalizedValue = Math.max(0, Math.min(1, normalizedValue));

  const percentage = normalizedValue * 100;

  // Определяем уровень
  if (percentage >= 90) {
    return type === 'confidence' ? 'Очень высокая' : 'Отличная';
  } else if (percentage >= 80) {
    return type === 'confidence' ? 'Высокая' : 'Хорошая';
  } else if (percentage >= 70) {
    return type === 'confidence' ? 'Выше средней' : 'Выше среднего';
  } else if (percentage >= 60) {
    return type === 'confidence' ? 'Средняя' : 'Средняя';
  } else if (percentage >= 50) {
    return type === 'confidence' ? 'Ниже средней' : 'Ниже среднего';
  } else if (percentage >= 40) {
    return type === 'confidence' ? 'Низкая' : 'Слабая';
  } else if (percentage >= 30) {
    return type === 'confidence' ? 'Очень низкая' : 'Очень слабая';
  } else {
    return type === 'confidence' ? 'Критически низкая' : 'Критически слабая';
  }
}

/**
 * Получить цвет для значения уверенности/score
 * @param value - Значение от 0 до 1 (или от 0 до 100)
 * @returns CSS класс цвета
 */
export function getConfidenceColor(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
    return 'text-600';
  }

  // Нормализуем значение к диапазону 0-1
  let normalizedValue = value;
  if (value > 1) {
    normalizedValue = value / 100;
  }

  // Ограничиваем диапазон
  normalizedValue = Math.max(0, Math.min(1, normalizedValue));

  const percentage = normalizedValue * 100;

  if (percentage >= 80) {
    return 'text-green-500';
  } else if (percentage >= 60) {
    return 'text-yellow-500';
  } else if (percentage >= 40) {
    return 'text-blue-500';
  } else {
    return 'text-red-500';
  }
}

/**
 * Получить полное описание уверенности с процентом и текстовым обозначением
 * @param value - Значение от 0 до 1 (или от 0 до 100)
 * @param type - Тип значения: 'confidence' (уверенность) или 'score' (оценка)
 * @returns Объект с текстом, процентом и цветом
 */
export function getConfidenceDescription(
  value: number | null | undefined, 
  type: 'confidence' | 'score' = 'confidence'
): { text: string; percentage: string; color: string; colorClass: string } {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
    return {
      text: 'Неизвестно',
      percentage: '—',
      color: 'text-600',
      colorClass: 'text-600'
    };
  }

  // Нормализуем значение к диапазону 0-1
  let normalizedValue = value;
  if (value > 1) {
    normalizedValue = value / 100;
  }

  // Ограничиваем диапазон
  normalizedValue = Math.max(0, Math.min(1, normalizedValue));

  const percentage = (normalizedValue * 100).toFixed(1);
  const color = getConfidenceColor(normalizedValue);

  return {
    text: translateConfidence(normalizedValue, type),
    percentage: `${percentage}%`,
    color,
    colorClass: color
  };
}

/**
 * Получить описание оценки (score) с процентом и текстовым обозначением
 * @param value - Значение от 0 до 1 (или от 0 до 100)
 * @returns Объект с текстом, процентом и цветом
 */
export function getScoreDescription(
  value: number | null | undefined
): { text: string; percentage: string; color: string; colorClass: string } {
  return getConfidenceDescription(value, 'score');
}

export default translateConfidence;

