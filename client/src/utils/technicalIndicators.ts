/**
 * Утилиты для расчета технических индикаторов на клиенте
 */

/**
 * Расчет RSI (Relative Strength Index)
 */
export function calculateRSI(prices: number[], period: number = 14): number[] {
  if (prices.length < period + 1) {
    return [];
  }

  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  // Вычисляем изменения цен
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  // Первое значение RSI
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  if (avgLoss === 0) {
    rsi.push(100);
  } else {
    const rs = avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }

  // Остальные значения RSI
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }

  return rsi;
}

/**
 * Расчет MACD (Moving Average Convergence Divergence)
 */
export function calculateMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  if (prices.length < slowPeriod + signalPeriod) {
    return { macd: [], signal: [], histogram: [] };
  }

  // Вычисляем EMA
  const calculateEMA = (data: number[], period: number): number[] => {
    const ema: number[] = [];
    const multiplier = 2 / (period + 1);
    
    // Первое значение - SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += data[i];
    }
    ema.push(sum / period);

    // Остальные значения - EMA
    for (let i = period; i < data.length; i++) {
      ema.push((data[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
    }

    return ema;
  };

  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);

  // MACD линия
  const macd: number[] = [];
  const offset = slowPeriod - fastPeriod;
  for (let i = 0; i < slowEMA.length; i++) {
    if (fastEMA[i + offset] !== undefined) {
      macd.push(fastEMA[i + offset] - slowEMA[i]);
    }
  }

  // Signal линия (EMA от MACD)
  const signal = calculateEMA(macd, signalPeriod);

  // Histogram (разница между MACD и Signal)
  const histogram: number[] = [];
  const signalOffset = macd.length - signal.length;
  for (let i = 0; i < signal.length; i++) {
    if (macd[i + signalOffset] !== undefined) {
      histogram.push(macd[i + signalOffset] - signal[i]);
    }
  }

  // Выравниваем массивы по длине
  const minLength = Math.min(macd.length, signal.length, histogram.length);
  return {
    macd: macd.slice(-minLength),
    signal: signal.slice(-minLength),
    histogram: histogram.slice(-minLength)
  };
}

/**
 * Расчет SMA (Simple Moving Average)
 */
export function calculateSMA(prices: number[], period: number): number[] {
  if (prices.length < period) {
    return [];
  }

  const sma: number[] = [];
  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += prices[j];
    }
    sma.push(sum / period);
  }

  return sma;
}

/**
 * Расчет EMA (Exponential Moving Average)
 */
export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) {
    return [];
  }

  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  // Первое значение - SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  ema.push(sum / period);

  // Остальные значения - EMA
  for (let i = period; i < prices.length; i++) {
    ema.push((prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
  }

  return ema;
}

/**
 * Расчет ATR (Average True Range)
 */
export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): number {
  if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1) {
    return 0;
  }

  const trueRanges: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr1 = highs[i] - lows[i];
    const tr2 = Math.abs(highs[i] - closes[i - 1]);
    const tr3 = Math.abs(lows[i] - closes[i - 1]);
    trueRanges.push(Math.max(tr1, tr2, tr3));
  }

  if (trueRanges.length < period) {
    return 0;
  }

  // Первое значение ATR - среднее первых period значений
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += trueRanges[i];
  }
  let atr = sum / period;

  // Остальные значения - сглаженное среднее
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return atr;
}

/**
 * Расчет Bollinger Bands и позиции цены
 */
export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number[]; middle: number[]; lower: number[]; position: number } {
  if (prices.length < period) {
    return { upper: [], middle: [], lower: [], position: 0.5 };
  }

  const sma = calculateSMA(prices, period);
  const upper: number[] = [];
  const lower: number[] = [];

  // Вычисляем стандартное отклонение для каждого периода
  for (let i = 0; i < sma.length; i++) {
    const startIdx = i;
    const endIdx = startIdx + period;
    const periodPrices = prices.slice(startIdx, endIdx);
    
    // Среднее значение
    const mean = sma[i];
    
    // Стандартное отклонение
    let variance = 0;
    for (const price of periodPrices) {
      variance += Math.pow(price - mean, 2);
    }
    const stdDeviation = Math.sqrt(variance / period);
    
    upper.push(mean + stdDeviation * stdDev);
    lower.push(mean - stdDeviation * stdDev);
  }

  // Позиция текущей цены в Bollinger Bands (0-1)
  const currentPrice = prices[prices.length - 1];
  const currentUpper = upper[upper.length - 1];
  const currentLower = lower[lower.length - 1];
  const position = currentUpper !== currentLower
    ? (currentPrice - currentLower) / (currentUpper - currentLower)
    : 0.5;

  return {
    upper,
    middle: sma,
    lower,
    position: Math.max(0, Math.min(1, position))
  };
}

/**
 * Расчет всех технических индикаторов из свечей
 */
export function calculateAllIndicators(candles: Array<{ open: number; high: number; low: number; close: number; volume: number }>) {
  if (candles.length < 20) {
    return null;
  }

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  // RSI
  const rsi = calculateRSI(closes, 14);

  // MACD
  const macd = calculateMACD(closes, 12, 26, 9);

  // SMA и EMA
  const sma20 = calculateSMA(closes, 20);
  const ema12 = calculateEMA(closes, 12);

  // ATR
  const atr = calculateATR(highs, lows, closes, 14);

  // Bollinger Bands
  const bb = calculateBollingerBands(closes, 20, 2);

  return {
    rsi: rsi.length > 0 ? rsi : undefined,
    macd: macd.macd.length > 0 ? macd : undefined,
    sma20: sma20.length > 0 ? sma20[sma20.length - 1] : undefined,
    ema12: ema12.length > 0 ? ema12[ema12.length - 1] : undefined,
    atr: atr > 0 ? atr : undefined,
    bollingerPosition: bb.position
  };
}


