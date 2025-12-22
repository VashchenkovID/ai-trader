/**
 * TypeScript типы для продвинутых метрик производительности
 */

export type PeriodType = 'daily' | 'weekly' | 'monthly';

export interface BaseMetrics {
  totalReturn: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  averageDailyProfit: number;
}

export interface AdvancedMetrics {
  sortinoRatio: number;
  calmarRatio: number;
  informationRatio: number | null;
  mae: number;
  mfe: number;
  maeMfeAvailable: boolean;
}

export interface DayOfWeekStats {
  profit: number;
  trades: number;
  winRate: number;
  avgProfit: number;
}

export interface DayOfWeekAnalysis {
  monday?: DayOfWeekStats;
  tuesday?: DayOfWeekStats;
  wednesday?: DayOfWeekStats;
  thursday?: DayOfWeekStats;
  friday?: DayOfWeekStats;
  saturday?: DayOfWeekStats;
  sunday?: DayOfWeekStats;
}

export interface MonthStats {
  year: number;
  month: string;
  monthIndex: number;
  totalProfit: number;
  totalTrades: number;
  winTrades: number;
  winRate: number;
  avgProfit: number;
}

export interface PeriodAnalysis {
  period: PeriodType;
  startDate?: string;
  endDate?: string;
  totalTrades: number;
  byDayOfWeek: DayOfWeekAnalysis | null;
  byMonth: MonthStats[];
  bestDay: {
    period: string;
    profit: number;
    trades: number;
    winRate: number;
    avgProfit: number;
  } | null;
  worstDay: {
    period: string;
    profit: number;
    trades: number;
    winRate: number;
    avgProfit: number;
  } | null;
  bestMonth: {
    period: string;
    profit: number;
    trades: number;
    winRate: number;
    avgProfit: number;
  } | null;
  worstMonth: {
    period: string;
    profit: number;
    trades: number;
    winRate: number;
    avgProfit: number;
  } | null;
  summary: {
    totalProfit: number;
    totalTrades: number;
    profitableTrades: number;
    winRate: number;
    avgProfit: number;
    dayOfWeek: {
      totalTrades: number;
      totalProfit: number;
      avgProfitPerDay: number;
      mostActiveDay: { day: string; profit: number; trades: number; winRate: number; avgProfit: number } | null;
      mostProfitableDay: { day: string; profit: number; trades: number; winRate: number; avgProfit: number } | null;
    } | null;
    month: {
      totalTrades: number;
      totalProfit: number;
      avgProfitPerMonth: number;
      mostActiveMonth: MonthStats | null;
      mostProfitableMonth: MonthStats | null;
    } | null;
  } | null;
}

export interface AdvancedMetricsResponse {
  success: boolean;
  data: {
    period: PeriodType;
    days: number;
    startDate: string;
    endDate: string;
    baseMetrics: BaseMetrics;
    advancedMetrics: AdvancedMetrics;
    stats?: any[];
    trends?: any;
    alerts?: any[];
  };
}

export interface SortinoRatioResponse {
  success: boolean;
  data: {
    sortinoRatio: number;
    period: PeriodType;
    days: number;
    riskFreeRate: number;
    startDate: string;
    endDate: string;
  };
}

export interface CalmarRatioResponse {
  success: boolean;
  data: {
    calmarRatio: number;
    period: PeriodType;
    days: number;
    annualReturn: number;
    maxDrawdown: number;
    startDate: string;
    endDate: string;
  };
}

export interface InformationRatioResponse {
  success: boolean;
  data: {
    informationRatio: number | null;
    period: PeriodType;
    days: number;
    message: string;
    startDate: string;
    endDate: string;
  };
}

export interface MAEMFEResponse {
  success: boolean;
  data: {
    mae: number;
    mfe: number;
    maeMfeAvailable: boolean;
    totalTrades: number;
    analyzedTrades: number;
    message: string;
  };
}

export interface PeriodAnalysisResponse {
  success: boolean;
  data: PeriodAnalysis;
  message?: string;
}

export interface AdvancedMetricsSummaryResponse {
  success: boolean;
  data: {
    period: PeriodType;
    days: number;
    startDate: string;
    endDate: string;
    baseMetrics: BaseMetrics;
    advancedMetrics: AdvancedMetrics;
    periodAnalysis: PeriodAnalysis | null;
  };
}

