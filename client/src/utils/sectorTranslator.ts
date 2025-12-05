/**
 * Утилита для конвертации английских названий секторов в русские
 */

const sectorTranslations: Record<string, string> = {
  // Основные сектора
  'Technology': 'Технологии',
  'technology': 'Технологии',
  'tech': 'Технологии',
  'Financial Services': 'Финансовые услуги',
  'financial_services': 'Финансовые услуги',
  'financial services': 'Финансовые услуги',
  'Healthcare': 'Здравоохранение',
  'healthcare': 'Здравоохранение',
  'health_care': 'Здравоохранение',
  'Consumer Cyclical': 'Потребительские товары (циклические)',
  'consumer_cyclical': 'Потребительские товары (циклические)',
  'consumer cyclical': 'Потребительские товары (циклические)',
  'Consumer Defensive': 'Потребительские товары (защитные)',
  'consumer_defensive': 'Потребительские товары (защитные)',
  'consumer defensive': 'Потребительские товары (защитные)',
  'Energy': 'Энергетика',
  'energy': 'Энергетика',
  'Industrials': 'Промышленность',
  'industrials': 'Промышленность',
  'Communication Services': 'Телекоммуникации',
  'communication_services': 'Телекоммуникации',
  'communication services': 'Телекоммуникации',
  'Utilities': 'Коммунальные услуги',
  'utilities': 'Коммунальные услуги',
  'Real Estate': 'Недвижимость',
  'real_estate': 'Недвижимость',
  'real estate': 'Недвижимость',
  'Basic Materials': 'Сырьевые материалы',
  'basic_materials': 'Сырьевые материалы',
  'basic materials': 'Сырьевые материалы',
  'Consumer Goods': 'Потребительские товары',
  'consumer_goods': 'Потребительские товары',
  'consumer goods': 'Потребительские товары',
  'consumer': 'Потребительские товары',
  'Services': 'Услуги',
  'services': 'Услуги',
  'Consumer Discretionary': 'Товары повседневного спроса',
  'consumer_discretionary': 'Товары повседневного спроса',
  'consumer discretionary': 'Товары повседневного спроса',
  'Consumer Staples': 'Товары первой необходимости',
  'consumer_staples': 'Товары первой необходимости',
  'consumer staples': 'Товары первой необходимости',
  
  // Российские сектора
  'Нефть и газ': 'Нефть и газ',
  'Финансы': 'Финансы',
  'Технологии': 'Технологии',
  'Телекоммуникации': 'Телекоммуникации',
  'Металлургия': 'Металлургия',
  'Энергетика': 'Энергетика',
  'Потребительские товары': 'Потребительские товары',
  'Недвижимость': 'Недвижимость',
  'Транспорт': 'Транспорт',
  'Химия': 'Химия',
  'Машиностроение': 'Машиностроение',
  'Розничная торговля': 'Розничная торговля',
  'Медиа': 'Медиа',
  'Строительство': 'Строительство',
  'Сельское хозяйство': 'Сельское хозяйство',
  
  // Альтернативные названия (дополнительные варианты)
  'Tech': 'Технологии',
  'Finance': 'Финансы',
  'Health': 'Здравоохранение',
  'Oil & Gas': 'Нефть и газ',
  'oil_gas': 'Нефть и газ',
  'oil & gas': 'Нефть и газ',
  'Telecom': 'Телекоммуникации',
  'Retail': 'Розничная торговля',
  'Media': 'Медиа',
  'Construction': 'Строительство',
  'Agriculture': 'Сельское хозяйство',
  'Metals': 'Металлургия',
  'Chemicals': 'Химия',
  'Machinery': 'Машиностроение',
  'Transport': 'Транспорт',
  
  // Общие
  'Unknown': 'Неизвестно',
  'Неизвестно': 'Неизвестно',
  'Other': 'Прочее',
  'Прочее': 'Прочее',
  'N/A': 'Неизвестно',
  '': 'Неизвестно'
};

/**
 * Нормализует название сектора для сравнения
 * - Приводит к нижнему регистру
 * - Заменяет подчеркивания на пробелы
 * - Убирает лишние пробелы
 */
function normalizeSector(sector: string): string {
  return sector
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Конвертирует английское название сектора в русское
 * @param sector - Название сектора на английском или русском
 * @returns Русское название сектора
 */
export function translateSector(sector: string | null | undefined): string {
  if (!sector) {
    return 'Неизвестно';
  }
  
  const trimmedSector = sector.trim();
  
  // Если уже русское название, возвращаем как есть
  if (sectorTranslations[trimmedSector]) {
    return sectorTranslations[trimmedSector];
  }
  
  // Нормализуем входное значение
  const normalizedInput = normalizeSector(trimmedSector);
  
  // Пробуем найти по ключу без учета регистра и подчеркиваний
  const foundKey = Object.keys(sectorTranslations).find(
    key => normalizeSector(key) === normalizedInput
  );
  
  if (foundKey) {
    return sectorTranslations[foundKey];
  }
  
  // Если не найдено, возвращаем оригинал
  return trimmedSector || 'Неизвестно';
}

/**
 * Получить все доступные переводы секторов
 */
export function getAvailableSectors(): string[] {
  return Object.values(sectorTranslations).filter(
    (value, index, self) => self.indexOf(value) === index
  );
}

export default translateSector;

