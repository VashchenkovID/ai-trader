import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AutoPaperTradingService } from '@/api/generated/services/AutoPaperTradingService'
import { PreflightCheckService } from '@/api/generated/services/PreflightCheckService'
import { RiskService } from '@/api/generated/services/RiskService'
import { SettingsService } from '@/api/generated/services/SettingsService'
import { SystemService } from '@/api/generated/services/SystemService'
import {
  Button,
  PageLayout,
  Sidebar,
  SurfaceCard,
  Switch,
  Text,
} from '@/components/ui'
import { APP_SIDEBAR_ITEMS, getActiveSidebarItemId, navigateFromSidebar } from '@/navigation/appSidebar'
import { useSystemStatusStore } from '@/store/systemStatusStore'
import { cn } from '@/utils/cn'
import './SettingsPage.scss'

type TabId = 'data' | 'settings'
type ActionKey =
  | 'fullSyncYear'
  | 'cacheUpdate'
  | 'trainingQuick'
  | 'trainingFull'
  | 'weeklyForecastGeneration'
  | 'weeklyForecastUpdate'
  | 'marketAnalysis'
  | 'degradationCheck'
type TaskStatus = 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'timeout'

type ActionState = {
  taskId: string | null
  status: TaskStatus
  error: string | null
  errorCode: string | null
  reason: string | null
  durationMs: number | null
  progressMessage: string | null
  progressStage: string | null
  resultLines: string[]
}

type SystemSetting = {
  key: string
  value: unknown
  module?: string | null
  description?: string | null
}

type TradingMode = 'paper' | 'real' | 'micro'

type HealthSnapshot = {
  status: string
  version: string
  timestamp: string
}

type RuntimeSummary = {
  databaseStatus: string
  schedulerJobsCount: number
  activeTraining: string
  activeTrading: string
  cpuPercent: string
  ramPercent: string
}

type KellySnapshot = {
  enabled: string
  conservativeFactor: string
  minTrades: string
  volatilityPeriod: string
}

type RiskSnapshot = {
  emergencyStop: string
  maxPositionSize: string
}

type PreflightSnapshot = {
  overallStatus: string
  lastCheck: string
  errorsCount: number
}

type SchedulerSnapshot = {
  jobsTotal: number
  running: number
  failed: number
}

type AnalysisKpiSnapshot = {
  window: '24h' | '7d' | '30d'
  coverage: number
  taskSuccessRate: number
  fallbackRate: number
  latencyP95Ms: number
  directionAccuracyFusion: number
  marginalGainLlmOverNn: number
  llmSkippedUnavailable: number
  alertsCount: number
}

/** Порядок вывода известных ключей; остальные — по алфавиту после них. */
const SETTINGS_DISPLAY_ORDER = [
  'trading_mode',
  'auto_paper_enabled',
  'system.mode',
  'risk.maxPositionSize',
  'portfolio.virtual.initial_capital',
] as const

const TARGET_VIRTUAL_CAPITAL = 50_000_000

/**
 * Человекочитаемые заголовки и пояснения (как блоки на вкладке «Данные»).
 * Для неизвестных ключей используется fallback из API description.
 */
const SETTING_USER_COPY: Record<string, { title: string; details: string }> = {
  trading_mode: {
    title: 'Режим торговли',
    details:
      'Глобальный сценарий исполнения: симуляция без реальных денег, реальный брокерский счёт или облегчённый режим с ограниченным риском. От этого зависят правила роутинга заявок и то, куда уходят ордера.',
  },
  auto_paper_enabled: {
    title: 'Автоторговля в paper',
    details:
      'Включение фонового автоматического исполнения сигналов в режиме paper (без реальных средств). Удобно для проверки стратегии и расписания без риска для депозита.',
  },
  'system.mode': {
    title: 'Режим системы',
    details:
      'Согласованное с платформой отображение текущего торгового режима (как система «видит» активный сценарий). Полезно сверять с «Режимом торговли» выше.',
  },
  'risk.maxPositionSize': {
    title: 'Максимальный размер позиции',
    details:
      'Верхняя доля капитала, которую можно использовать под одну позицию (доля от 0 до 1). Снижает переконцентрацию риска в одном инструменте.',
  },
  'portfolio.virtual.initial_capital': {
    title: 'Виртуальный капитал портфеля',
    details:
      'Бюджет виртуального портфеля для paper-режима. Используется как базовая величина для симуляции и расчетов в тестовом торговом контуре.',
  },
}

function prettifyUnknownSettingKey(key: string): string {
  return key
    .replace(/\./g, ' · ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function fallbackCopyFromApi(item: SystemSetting): { title: string; details: string } {
  const raw = [item.module, item.description].filter(Boolean).join(' · ')
  const title = prettifyUnknownSettingKey(item.key)
  if (!raw) {
    return {
      title,
      details: 'Параметр приходит из API. Значение ниже отражает текущее состояние сервера.',
    }
  }
  return {
    title,
    details: raw,
  }
}

function getSettingPresentation(item: SystemSetting): { title: string; details: string } {
  return SETTING_USER_COPY[item.key] ?? fallbackCopyFromApi(item)
}

function formatTradingModeValue(raw: string): string {
  const v = raw.trim().toLowerCase()
  const map: Record<string, string> = {
    paper: 'paper — бумажная торговля (симуляция, без реальных денег)',
    real: 'real — реальный счёт и реальные заявки',
    micro: 'micro — режим с урезанным риском / малыми объёмами',
  }
  return map[v] ?? raw
}

function formatSettingValueLabel(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return '—'
  }
  if (typeof value === 'boolean') {
    return value ? 'Да' : 'Нет'
  }
  if (typeof value === 'number') {
    if (key === 'risk.maxPositionSize' && value >= 0 && value <= 1) {
      const pct = Math.round(value * 1000) / 10
      return `${value} (${pct}% капитала на одну позицию)`
    }
    if (key === 'portfolio.virtual.initial_capital') {
      return new Intl.NumberFormat('ru-RU').format(value)
    }
    return String(value)
  }
  if (typeof value === 'string') {
    if (key === 'trading_mode' || key === 'system.mode') {
      return formatTradingModeValue(value)
    }
    if (key === 'portfolio.virtual.initial_capital') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return new Intl.NumberFormat('ru-RU').format(parsed)
    }
    return value
  }
  return JSON.stringify(value)
}

function parseTradingMode(value: unknown): TradingMode {
  const normalized = String(value ?? 'paper').trim().toLowerCase()
  if (normalized === 'real' || normalized === 'micro') {
    return normalized
  }
  return 'paper'
}

function asText(value: unknown, fallback = '—'): string {
  if (value === null || value === undefined) return fallback
  const text = String(value).trim()
  return text === '' ? fallback : text
}

/** Тон подсветки значения в сводке (дизайн-система: primary / success / danger / warning). */
type InsightValueTone = 'accent' | 'good' | 'bad' | 'warn' | 'neutral'

function formatRuDateTime(raw: string): string {
  if (!raw || raw === '—') return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d)
}

function formatPercentLabel(raw: string): string {
  if (!raw || raw === '—') return '—'
  const n = Number(String(raw).replace(',', '.'))
  if (!Number.isFinite(n)) return raw
  return `${Math.round(n)}%`
}

function formatRatioPercent(ratio: number | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return '—'
  return `${Math.round(ratio * 1000) / 10}%`
}

/** HTTP /system/status часто не отдаёт CPU/RAM — подмешиваем числа из WS snapshot.system. */
function mergeResourcePercent(
  httpRaw: string | undefined,
  wsPercent: number | undefined
): { text: string; tone: InsightValueTone } {
  const http = httpRaw?.trim()
  if (http && http !== '—') {
    const formatted = formatPercentLabel(http)
    if (formatted !== '—') return { text: formatted, tone: 'accent' }
  }
  if (wsPercent != null && Number.isFinite(wsPercent)) {
    return { text: `${Math.round(wsPercent)}%`, tone: 'accent' }
  }
  return { text: 'нет данных', tone: 'neutral' }
}

function translateBooleanLike(value: unknown): { text: string; tone: InsightValueTone } {
  if (value === null || value === undefined) return { text: 'нет данных', tone: 'neutral' }
  if (value === true || value === 1) return { text: 'включено', tone: 'good' }
  if (value === false || value === 0) return { text: 'выключено', tone: 'neutral' }
  const s = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(s)) return { text: 'включено', tone: 'good' }
  if (['false', '0', 'no', 'off'].includes(s)) return { text: 'выключено', tone: 'neutral' }
  if (s === '' || s === '—') return { text: 'нет данных', tone: 'neutral' }
  return { text: String(value), tone: 'accent' }
}

function translateHealthStatus(raw: string): { text: string; tone: InsightValueTone } {
  const s = raw.trim().toLowerCase()
  if (s === '' || s === '—') return { text: 'нет данных', tone: 'neutral' }
  if (s === 'healthy' || s === 'ok' || s === 'up') return { text: 'в норме', tone: 'good' }
  if (s === 'unhealthy' || s === 'down' || s === 'error') return { text: 'проблема', tone: 'bad' }
  if (s === 'unknown') return { text: 'неизвестно', tone: 'warn' }
  return { text: raw, tone: 'accent' }
}

function translatePreflightOverall(raw: string): { text: string; tone: InsightValueTone } {
  const s = raw.trim().toLowerCase()
  if (s === '' || s === '—') return { text: 'нет данных', tone: 'neutral' }
  if (s === 'passed' || s === 'ok' || s === 'success') return { text: 'пройдено', tone: 'good' }
  if (s === 'failed' || s === 'error') return { text: 'ошибка', tone: 'bad' }
  if (s === 'unknown') return { text: 'неизвестно', tone: 'warn' }
  if (s === 'pending') return { text: 'ожидание', tone: 'warn' }
  if (s === 'running') return { text: 'выполняется', tone: 'warn' }
  return { text: raw, tone: 'accent' }
}

function translateSubsystemStatus(raw: string): { text: string; tone: InsightValueTone } {
  const s = raw.trim().toLowerCase()
  if (s === '' || s === '—') return { text: 'нет данных', tone: 'neutral' }
  if (s === 'idle' || s === 'waiting') return { text: 'ожидание', tone: 'neutral' }
  if (s === 'connecting') return { text: 'подключение', tone: 'warn' }
  if (s === 'reconnecting') return { text: 'переподключение', tone: 'warn' }
  if (s === 'running') return { text: 'работает', tone: 'good' }
  if (s === 'ready') return { text: 'готов', tone: 'good' }
  if (s === 'connected' || s === 'healthy') return { text: 'в норме', tone: 'good' }
  if (s === 'degraded') return { text: 'снижено', tone: 'warn' }
  if (s === 'failed' || s === 'error') return { text: 'ошибка', tone: 'bad' }
  return { text: raw, tone: 'accent' }
}

function InsightValue({ tone, children }: { tone: InsightValueTone; children: ReactNode }) {
  return (
    <span className={cn('settings-page__insight-value', `settings-page__insight-value--${tone}`)}>
      {children}
    </span>
  )
}

function InsightLine({
  label,
  value,
  tone = 'accent',
}: {
  label: string
  value: ReactNode
  tone?: InsightValueTone
}) {
  return (
    <p className="settings-page__insight-line">
      <Text as="span" variant="hint" tone="muted" className="settings-page__insight-label">
        {label}
      </Text>
      <InsightValue tone={tone}>{value}</InsightValue>
    </p>
  )
}

function orderedSettingsItems(items: SystemSetting[]): SystemSetting[] {
  const rank = new Map<string, number>(
    SETTINGS_DISPLAY_ORDER.map((key, index) => [key, index])
  )
  return [...items].sort((a, b) => {
    const ra = rank.has(a.key) ? rank.get(a.key)! : 1000
    const rb = rank.has(b.key) ? rank.get(b.key)! : 1000
    if (ra !== rb) {
      return ra - rb
    }
    return a.key.localeCompare(b.key)
  })
}

function formatProgressStage(progress: Record<string, unknown> | null): string | null {
  if (!progress) return null
  const stageLabel = progress.stageLabel ? String(progress.stageLabel) : ''
  const stageIndexRaw = Number(progress.stageIndex)
  const stageTotalRaw = Number(progress.stageTotal)
  const hasIdx = Number.isFinite(stageIndexRaw) && stageIndexRaw > 0
  const hasTotal = Number.isFinite(stageTotalRaw) && stageTotalRaw > 0
  if (hasIdx && hasTotal && stageLabel) {
    return `Этап ${Math.round(stageIndexRaw)}/${Math.round(stageTotalRaw)} · ${stageLabel}`
  }
  if (hasIdx && hasTotal) {
    return `Этап ${Math.round(stageIndexRaw)}/${Math.round(stageTotalRaw)}`
  }
  if (stageLabel) return stageLabel
  return null
}

function extractTaskPayload(resultObj: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!resultObj) return null
  const nested = resultObj.result
  if (nested && typeof nested === 'object') return nested as Record<string, unknown>
  return resultObj
}

function formatActionResultLines(
  actionKey: ActionKey,
  payload: Record<string, unknown> | null
): string[] {
  if (!payload) return []
  if (actionKey === 'marketAnalysis') {
    const lines: string[] = []
    const summary = (payload.summary || {}) as Record<string, unknown>
    const createdList = Array.isArray(summary.created) ? summary.created : []
    const skippedList = Array.isArray(summary.skipped) ? summary.skipped : []
    const created = createdList.length
    const skipped = skippedList.length
    const totalTargets = Number(payload.totalTargets || 0)
    const canaryProcessed = Number(payload.canaryProcessed || 0)
    const canarySkipped = Number(payload.canarySkipped || 0)
    const recommendationBuy = Number(payload.recommendationBuy || 0)
    const recommendationSell = Number(payload.recommendationSell || 0)
    const recommendationHold = Number(payload.recommendationHold || 0)
    const recommendationTotal = recommendationBuy + recommendationSell + recommendationHold

    lines.push(`Всего инструментов в контуре анализа: ${totalTargets}`)
    lines.push(`Обработано в текущем прогоне: ${canaryProcessed} (вне canary: ${canarySkipped})`)
    lines.push(
      `Получены рекомендации: BUY ${recommendationBuy}, SELL ${recommendationSell}, HOLD ${recommendationHold} (всего ${recommendationTotal})`
    )
    lines.push(`Заявок создано: ${created}`)
    lines.push(`Рекомендаций пропущено: ${skipped}`)
    if (created > 0) {
      lines.push(`FIGI, по которым созданы заявки: ${createdList.slice(0, 10).join(', ')}`)
    }

    if (skipped > 0) {
      const reasonCounts: Record<string, number> = {}
      for (const raw of skippedList) {
        if (!raw || typeof raw !== 'object') continue
        const reason = String((raw as Record<string, unknown>).reason || 'other')
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1
      }
      const skippedByReason = Object.entries(reasonCounts)
        .map(([reason, count]) => `${reason}: ${count}`)
        .join(', ')
      if (skippedByReason) {
        lines.push(`Причины пропуска: ${skippedByReason}`)
      }
    }

    lines.push(
      `Fusion NN+LLM: ${Number(payload.fusionBoth || 0)}, NN-only: ${Number(payload.fusionNnOnly || 0)}, LLM-only: ${Number(payload.fusionLlmOnly || 0)}`
    )
    lines.push(
      `LLM обновлено: ${Number(payload.llmEnriched || 0)} / ${Number(payload.llmTotalTargets || 0)}`
    )
    if (Number(payload.skippedNoSignal || 0) > 0) {
      lines.push(`Пропущено без сигнала: ${Number(payload.skippedNoSignal || 0)}`)
    }
    return lines
  }
  if (actionKey === 'weeklyForecastGeneration' || actionKey === 'weeklyForecastUpdate') {
    const lines: string[] = []
    const runId = String(payload.mlflowRunId || '').trim()
    const totalInstruments = Number(payload.totalInstruments || payload.instrumentTotal || 0)
    const eligible = Number(payload.instrumentEligible || 0)
    const skipped = Number(payload.instrumentSkipped || 0)
    const rowsTotal = Number(payload.rowsTotal || 0)
    const rowsUsed = Number(payload.rowsUsed || 0)
    const rowsSkipped = Number(payload.rowsSkipped || 0)
    const resumeFromLatest = Boolean(payload.resumeFromLatest)
    const universe = String(payload.processedUniverse || '').trim()
    const params =
      payload.parameters && typeof payload.parameters === 'object'
        ? (payload.parameters as Record<string, unknown>)
        : null
    const skipReasons =
      payload.skipReasons && typeof payload.skipReasons === 'object'
        ? (payload.skipReasons as Record<string, unknown>)
        : null
    if (actionKey === 'weeklyForecastGeneration') {
      lines.push('Weekly forecast: генерация завершена')
    } else {
      lines.push('Weekly forecast: обновление завершено')
    }
    lines.push(`Охват universe: ${totalInstruments} инструментов`)
    if (eligible > 0 || skipped > 0) {
      lines.push(`Подошло к обучению: ${eligible}, пропущено: ${skipped}`)
    }
    if (rowsTotal > 0 || rowsUsed > 0) {
      lines.push(`Свечей: собрано ${rowsTotal}, использовано ${rowsUsed}, пропущено ${rowsSkipped}`)
    }
    if (universe === 'all_instruments') {
      lines.push('Контур: все инструменты из справочника')
    }
    lines.push(
      `Режим обучения: ${resumeFromLatest ? 'инкрементальный (resume from latest)' : 'полный retrain'}`
    )
    if (skipReasons) {
      const reasonText = Object.entries(skipReasons)
        .map(([k, v]) => `${k}: ${Number(v || 0)}`)
        .join(', ')
      if (reasonText) {
        lines.push(`Причины пропусков: ${reasonText}`)
      }
    }
    if (params) {
      const paramParts: string[] = []
      if (params.epochs !== undefined) paramParts.push(`epochs=${String(params.epochs)}`)
      if (params.batchSize !== undefined) paramParts.push(`batchSize=${String(params.batchSize)}`)
      if (params.lr !== undefined) paramParts.push(`lr=${String(params.lr)}`)
      if (params.seqLen !== undefined) paramParts.push(`seqLen=${String(params.seqLen)}`)
      if (params.nForecast !== undefined) paramParts.push(`nForecast=${String(params.nForecast)}`)
      if (paramParts.length > 0) {
        lines.push(`Параметры: ${paramParts.join(', ')}`)
      }
    }
    if (runId) {
      lines.push(`MLflow run: ${runId}`)
    }
    return lines
  }
  if (actionKey === 'trainingQuick' || actionKey === 'trainingFull') {
    const lines: string[] = []
    const totalInstruments = Number(payload.totalInstruments || 0)
    const trainedInstruments = Number(payload.trainedInstruments || 0)
    const skippedInstruments = Number(payload.skippedInstruments || 0)
    const metaSucceeded = Number(payload.metaSucceeded || 0)
    const metaFailed = Number(payload.metaFailed || 0)
    const runId = String(payload.mlflowRunId || '').trim()
    if (totalInstruments > 0 || trainedInstruments > 0 || skippedInstruments > 0) {
      lines.push(
        `Инструменты: всего ${totalInstruments}, обучено ${trainedInstruments}, пропущено ${skippedInstruments}`
      )
    }
    if (metaSucceeded > 0 || metaFailed > 0) {
      lines.push(`Meta/ensemble: успешно ${metaSucceeded}, с ошибкой ${metaFailed}`)
    }
    if (runId) {
      lines.push(`MLflow run: ${runId}`)
    }
    if (lines.length > 0) return lines
  }
  const msgRaw = String(payload.message || '').trim()
  const msg =
    msgRaw === 'weekly generation completed'
      ? 'Weekly forecast: генерация завершена'
      : msgRaw === 'weekly update completed'
        ? 'Weekly forecast: обновление завершено'
        : msgRaw
  return msg ? [msg] : []
}

/** Типы фоновых задач (вкладка «Данные» / system-status WS). */
const MONITORED_BACKGROUND_TASK_TYPES = new Set([
  'full_db_sync_year',
  'cache_update',
  'training_quick',
  'training_full',
  'weekly_generation',
  'weekly_update',
  'analysis_market_portfolio',
  'weekly_backtest',
])

function normalizeTaskStatus(status: string | undefined | null): string {
  return String(status ?? '').trim().toLowerCase()
}

/** Завершённые / неактивные статусы — не блокируют смену режима и баннер. */
function isTerminalOrIdleTaskStatus(status: string | undefined | null): boolean {
  const s = normalizeTaskStatus(status)
  return (
    s === '' ||
    s === 'idle' ||
    s === 'completed' ||
    s === 'failed' ||
    s === 'skipped' ||
    s === 'timeout' ||
    s === 'not_found'
  )
}

function isLocalActionActivelyRunning(action: ActionState): boolean {
  const s = normalizeTaskStatus(action.status)
  return s === 'queued' || s === 'running'
}

/**
 * Учитывает только реально идущие задачи: завершённые (в т.ч. с заполненным finishedAt)
 * не считаются активными даже при рассинхроне строки status.
 */
function isSocketTaskBlockingBackground(task: {
  taskType: string
  status: string
  finishedAt?: string | null
}): boolean {
  if (!MONITORED_BACKGROUND_TASK_TYPES.has(task.taskType)) return false
  const finishedAt = task.finishedAt
  if (finishedAt != null && String(finishedAt).trim() !== '') {
    return false
  }
  const st = normalizeTaskStatus(task.status)
  if (isTerminalOrIdleTaskStatus(st)) return false
  return st === 'queued' || st === 'running'
}

const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 180

const initialActionState: ActionState = {
  taskId: null,
  status: 'idle',
  error: null,
  errorCode: null,
  reason: null,
  durationMs: null,
  progressMessage: null,
  progressStage: null,
  resultLines: [],
}

const statusLabel: Record<TaskStatus, string> = {
  idle: 'Ожидание',
  queued: 'В очереди',
  running: 'Выполняется',
  completed: 'Завершено',
  failed: 'Ошибка',
  timeout: 'Таймаут',
}

export function SettingsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const mountedRef = useRef(true)
  /** Увеличивается при каждом новом запуске action — отменяет устаревший polling предыдущего запуска. */
  const pollGenerationRef = useRef<Record<ActionKey, number>>({
    fullSyncYear: 0,
    cacheUpdate: 0,
    trainingQuick: 0,
    trainingFull: 0,
    weeklyForecastGeneration: 0,
    weeklyForecastUpdate: 0,
    marketAnalysis: 0,
    degradationCheck: 0,
  })
  const [activeTab, setActiveTab] = useState<TabId>('data')
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState<string | null>(null)
  const [settingsItems, setSettingsItems] = useState<SystemSetting[]>([])
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingActionError, setSettingActionError] = useState<string | null>(null)
  const [isAutoPaperBusy, setIsAutoPaperBusy] = useState(false)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)
  const [isPreflightRunBusy, setIsPreflightRunBusy] = useState(false)
  const [healthSnapshot, setHealthSnapshot] = useState<HealthSnapshot | null>(null)
  const [runtimeSummary, setRuntimeSummary] = useState<RuntimeSummary | null>(null)
  const [kellySnapshot, setKellySnapshot] = useState<KellySnapshot | null>(null)
  const [riskSnapshot, setRiskSnapshot] = useState<RiskSnapshot | null>(null)
  const [preflightSnapshot, setPreflightSnapshot] = useState<PreflightSnapshot | null>(null)
  const [schedulerSnapshot, setSchedulerSnapshot] = useState<SchedulerSnapshot | null>(null)
  const [analysisKpiSnapshot, setAnalysisKpiSnapshot] = useState<AnalysisKpiSnapshot | null>(null)
  const [analysisKpiWindow, setAnalysisKpiWindow] = useState<'24h' | '7d' | '30d'>('7d')
  const [pendingTradingMode, setPendingTradingMode] = useState<TradingMode>('paper')
  const [isTradingModeBusy, setIsTradingModeBusy] = useState(false)
  const [isVirtualCapitalBusy, setIsVirtualCapitalBusy] = useState(false)
  const [tradingModeValidation, setTradingModeValidation] = useState<string[]>([])
  const [tradingModeValidationPassed, setTradingModeValidationPassed] = useState(false)
  const [actions, setActions] = useState<Record<ActionKey, ActionState>>({
    fullSyncYear: initialActionState,
    cacheUpdate: initialActionState,
    trainingQuick: initialActionState,
    trainingFull: initialActionState,
    weeklyForecastGeneration: initialActionState,
    weeklyForecastUpdate: initialActionState,
    marketAnalysis: initialActionState,
    degradationCheck: initialActionState,
  })
  const socketTasks = useSystemStatusStore(state => state.tasks)
  const wsSystemMetrics = useSystemStatusStore(state => state.snapshot?.system)
  const wsConnectionStatus = useSystemStatusStore(state => state.connectionStatus)

  const activeSidebarItemId = getActiveSidebarItemId(location.pathname)
  const hasActiveTasks = Object.values(actions).some(isLocalActionActivelyRunning)
  const hasActiveSocketTasks = socketTasks.some(isSocketTaskBlockingBackground)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!socketTasks.length) return
    const isTerminalTaskStatus = (s: string) =>
      ['completed', 'failed', 'skipped', 'timeout', 'not_found'].includes(s)

    setActions(prev => {
      const byTaskType: Record<string, ActionKey> = {
        full_db_sync_year: 'fullSyncYear',
        cache_update: 'cacheUpdate',
        training_quick: 'trainingQuick',
        training_full: 'trainingFull',
        weekly_generation: 'weeklyForecastGeneration',
        weekly_update: 'weeklyForecastUpdate',
        analysis_market_portfolio: 'marketAnalysis',
        weekly_backtest: 'degradationCheck',
      }
      let changed = false
      const next = { ...prev }
      for (const task of socketTasks) {
        const actionKey = byTaskType[task.taskType]
        if (!actionKey) continue
        const current = next[actionKey]
        // Не подмешивать старую задачу из WS после сброса taskId (иначе ошибка не исчезает при повторном запуске).
        const shouldAttachTask =
          current.taskId != null && current.taskId !== ''
            ? current.taskId === task.taskId
            : current.status === 'idle' ||
                current.status === 'queued' ||
                current.status === 'running'
              ? !isTerminalTaskStatus(task.status)
              : false
        if (!shouldAttachTask) continue
        const mappedStatus: TaskStatus =
          task.status === 'queued' || task.status === 'running' || task.status === 'completed'
            ? (task.status as TaskStatus)
            : task.status === 'failed'
              ? 'failed'
              : current.status
        const nextError = task.error ?? current.error
        const resultObj = task.result as Record<string, unknown> | null | undefined
        const progressObj = (resultObj?.progress || null) as Record<string, unknown> | null
        const progressMessage = progressObj?.message ? String(progressObj.message) : null
        const progressStage = formatProgressStage(progressObj)
        const reason = resultObj?.reason ? String(resultObj.reason) : null
        const errorCode =
          (task as Record<string, unknown>).errorCode != null
            ? String((task as Record<string, unknown>).errorCode)
            : null
        const timingObj =
          (task as Record<string, unknown>).timing &&
          typeof (task as Record<string, unknown>).timing === 'object'
            ? ((task as Record<string, unknown>).timing as Record<string, unknown>)
            : null
        const durationRaw = Number(timingObj?.durationMs ?? Number.NaN)
        const durationMs = Number.isFinite(durationRaw) ? durationRaw : null
        const resultPayload = extractTaskPayload(resultObj ?? null)
        const resultLines =
          mappedStatus === 'completed'
            ? formatActionResultLines(actionKey, resultPayload)
            : current.resultLines
        if (
          current.taskId !== task.taskId ||
          current.status !== mappedStatus ||
          current.error !== nextError ||
          current.errorCode !== errorCode ||
          current.reason !== reason ||
          current.durationMs !== durationMs ||
          current.progressMessage !== progressMessage ||
          current.progressStage !== progressStage ||
          current.resultLines.join('\n') !== resultLines.join('\n')
        ) {
          next[actionKey] = {
            taskId: task.taskId,
            status: mappedStatus,
            error: nextError,
            errorCode,
            reason,
            durationMs,
            progressMessage,
            progressStage,
            resultLines,
          }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [socketTasks])

  const updateAction = (key: ActionKey, patch: Partial<ActionState>) => {
    if (!mountedRef.current) return
    setActions(prev => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }))
  }

  const handleSidebarSelect = (itemId: string) => {
    navigateFromSidebar(navigate, itemId)
  }

  const refreshCacheUpdatedAt = async () => {
    const response = await SystemService.systemTasksApiV1SystemTasksGet({ limit: 200 })
    const items = (response.data.items || []) as Record<string, unknown>[]
    const latest = items.find(item => String(item.taskType || '') === 'cache_update')
    setCacheUpdatedAt(latest ? String(latest.finishedAt || latest.queuedAt || '') : null)
  }

  const loadSettings = async () => {
    setSettingsLoading(true)
    setSettingsError(null)
    try {
      const response = await SystemService.systemSettingsApiV1SystemSettingsGet({
        offset: 0,
        limit: 1000,
      })
      setSettingsItems((response.data.items || []) as SystemSetting[])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка загрузки системных настроек'
      setSettingsError(message)
    } finally {
      setSettingsLoading(false)
    }
  }

  const loadSettingsInsights = async () => {
    setInsightsLoading(true)
    setInsightsError(null)
    try {
      const [healthRes, statusRes, schedulerRes, kellyRes, riskRes, preflightRes, kpiRes] = await Promise.all([
        SystemService.systemHealthApiV1SystemHealthGet(),
        SystemService.systemStatusApiV1SystemStatusGet(),
        SystemService.systemSchedulerStatusApiV1SystemSchedulerStatusGet(),
        SettingsService.getKellySettingsApiV1SettingsKellyGet(),
        RiskService.riskStatusApiV1RiskStatusGet(),
        PreflightCheckService.preflightResultsApiV1PreflightCheckResultsGet(),
        SystemService.analysisKpiApiV1SystemAnalysisKpiGet({ window: analysisKpiWindow }),
      ])

      const healthData = (healthRes.data || {}) as Record<string, unknown>
      setHealthSnapshot({
        status: asText(healthData.status, '—'),
        version: asText(healthData.version, '—'),
        timestamp: asText(healthData.timestamp, '—'),
      })

      const statusData = (statusRes.data || {}) as Record<string, unknown>
      const resources = (statusData.resources || {}) as Record<string, unknown>
      const scheduler = (statusData.schedulerJobs || {}) as Record<string, unknown>
      setRuntimeSummary({
        databaseStatus: asText((statusData.database as Record<string, unknown> | undefined)?.status, '—'),
        schedulerJobsCount: Object.keys(scheduler).length,
        activeTraining: asText(
          (statusData.neuralNetwork as Record<string, unknown> | undefined)?.status,
          '—'
        ),
        activeTrading: asText((statusData.trading as Record<string, unknown> | undefined)?.status, '—'),
        cpuPercent: asText(resources.cpuPercent, '—'),
        ramPercent: asText(resources.ramPercent, '—'),
      })

      const schedulerData = (schedulerRes.data || {}) as Record<string, unknown>
      const schedulerItems = (
        schedulerData.jobs ||
        schedulerData.items ||
        []
      ) as Array<Record<string, unknown>>
      const running = schedulerItems.filter(
        item => normalizeTaskStatus(asText(item.status, '')) === 'running'
      ).length
      const failed = schedulerItems.filter(item => {
        const st = normalizeTaskStatus(asText(item.status, ''))
        return st === 'error' || st === 'failed'
      }).length
      setSchedulerSnapshot({
        jobsTotal: schedulerItems.length,
        running,
        failed,
      })

      const kellyData = (kellyRes.data || {}) as Record<string, unknown>
      setKellySnapshot({
        enabled: asText(kellyData.enabled, '—'),
        conservativeFactor: asText(kellyData.conservativeFactor, '—'),
        minTrades: asText(kellyData.minTrades, '—'),
        volatilityPeriod: asText(kellyData.volatilityPeriod, '—'),
      })

      const riskData = (riskRes.data || {}) as Record<string, unknown>
      const limitsData = (riskData.limits || {}) as Record<string, unknown>
      const emergencyRaw = riskData.emergencyStop
      const emergencyStopStr =
        typeof emergencyRaw === 'boolean'
          ? emergencyRaw
            ? 'true'
            : 'false'
          : asText(emergencyRaw, '—')
      setRiskSnapshot({
        emergencyStop: emergencyStopStr,
        maxPositionSize: asText(
          limitsData.maxPositionSize,
          asText(readNumberSetting('risk.maxPositionSize'))
        ),
      })

      const preflightData = (preflightRes.data || {}) as Record<string, unknown>
      const errors = (preflightData.errors || []) as unknown[]
      setPreflightSnapshot({
        overallStatus: asText(preflightData.overallStatus, '—'),
        lastCheck: asText(preflightData.timestamp, '—'),
        errorsCount: errors.length,
      })

      const kpiData = (kpiRes.data || {}) as Record<string, unknown>
      const report = (kpiData.report || {}) as Record<string, unknown>
      const operability = (report.operability || {}) as Record<string, unknown>
      const quality = (report.quality || {}) as Record<string, unknown>
      const fusion = (report.fusion || {}) as Record<string, unknown>
      const summary = (report.summary || {}) as Record<string, unknown>
      const alerts = (kpiData.alerts || {}) as Record<string, unknown>
      setAnalysisKpiSnapshot({
        window: (asText(kpiData.window, analysisKpiWindow) as '24h' | '7d' | '30d') ?? analysisKpiWindow,
        coverage: Number(operability.coverage ?? 0),
        taskSuccessRate: Number(operability.taskSuccessRate ?? 0),
        fallbackRate: Number(fusion.fallbackRate ?? 0),
        latencyP95Ms: Number(summary.latencyP95Ms ?? 0),
        directionAccuracyFusion: Number(quality.directionAccuracyFusion ?? 0),
        marginalGainLlmOverNn: Number(fusion.marginalGainLlmOverNn ?? 0),
        llmSkippedUnavailable: Number(fusion.llmSkippedUnavailable ?? 0),
        alertsCount: Number(alerts.count ?? 0),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка загрузки сводки системы'
      setInsightsError(message)
    } finally {
      setInsightsLoading(false)
    }
  }

  const runPreflightCheck = async () => {
    if (isPreflightRunBusy) return
    setIsPreflightRunBusy(true)
    setInsightsError(null)
    try {
      await PreflightCheckService.preflightRunApiV1PreflightCheckRunPost()
      await loadSettingsInsights()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка запуска preflight-проверки'
      setInsightsError(message)
    } finally {
      setIsPreflightRunBusy(false)
    }
  }

  useEffect(() => {
    void refreshCacheUpdatedAt()
    void loadSettings()
  }, [])

  useEffect(() => {
    void loadSettingsInsights()
  }, [analysisKpiWindow])

  useEffect(() => {
    const current = settingsItems.find(setting => setting.key === 'trading_mode')
    if (!current) return
    setPendingTradingMode(parseTradingMode(current.value))
  }, [settingsItems])

  const readBooleanSetting = (key: string, fallback = false): boolean => {
    const item = settingsItems.find(setting => setting.key === key)
    if (!item) return fallback
    if (typeof item.value === 'boolean') return item.value
    if (typeof item.value === 'string') {
      const v = item.value.trim().toLowerCase()
      return ['true', '1', 'yes', 'on'].includes(v)
    }
    if (typeof item.value === 'number') return item.value !== 0
    return fallback
  }

  const setSettingValue = (key: string, value: unknown) => {
    setSettingsItems(prev => prev.map(item => (item.key === key ? { ...item, value } : item)))
  }

  const readStringSetting = (key: string, fallback = ''): string => {
    const item = settingsItems.find(setting => setting.key === key)
    if (!item) return fallback
    if (typeof item.value === 'string') return item.value
    if (item.value == null) return fallback
    return String(item.value)
  }

  const readNumberSetting = (key: string, fallback = Number.NaN): number => {
    const item = settingsItems.find(setting => setting.key === key)
    if (!item) return fallback
    if (typeof item.value === 'number') return item.value
    if (typeof item.value === 'string') {
      const parsed = Number(item.value)
      return Number.isFinite(parsed) ? parsed : fallback
    }
    return fallback
  }

  const handleAutoPaperToggle = async (enabled: boolean) => {
    if (isAutoPaperBusy) return
    setSettingActionError(null)
    setIsAutoPaperBusy(true)
    try {
      if (enabled) {
        await AutoPaperTradingService.autoPaperEnableApiV1AutoPaperTradingEnablePost()
      } else {
        await AutoPaperTradingService.autoPaperDisableApiV1AutoPaperTradingDisablePost()
      }
      setSettingValue('auto_paper_enabled', enabled)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка переключения auto paper'
      setSettingActionError(message)
    } finally {
      setIsAutoPaperBusy(false)
    }
  }

  const getTradingModeValidationMessages = (
    targetMode: TradingMode
  ): { ok: boolean; messages: string[] } => {
    const messages: string[] = []
    const currentMode = parseTradingMode(readStringSetting('trading_mode', 'paper'))
    const autoPaperEnabled = readBooleanSetting('auto_paper_enabled')
    const maxPosition = readNumberSetting('risk.maxPositionSize', Number.NaN)
    const hasBlockingTasks = hasActiveTasks || hasActiveSocketTasks

    if (targetMode === currentMode) {
      messages.push('Режим уже активен: переключение не требуется.')
    }
    if (hasBlockingTasks) {
      messages.push('Есть активные фоновые задачи. Дождитесь завершения перед сменой режима.')
    }
    if (targetMode === 'real' && autoPaperEnabled) {
      messages.push('Для режима real сначала выключите auto paper.')
    }
    if (targetMode === 'real' && Number.isFinite(maxPosition) && maxPosition > 0.1) {
      messages.push('Для real рекомендуется risk.maxPositionSize <= 0.1.')
    }
    if (targetMode === 'micro' && Number.isFinite(maxPosition) && maxPosition > 0.2) {
      messages.push('Для micro рекомендуется risk.maxPositionSize <= 0.2.')
    }
    if (targetMode === 'paper' && autoPaperEnabled) {
      messages.push('Paper + auto paper: допустимо, можно переключать.')
    }

    return { ok: messages.length === 0 || messages.every(m => m.includes('допустимо')), messages }
  }

  const validateAndApplyTradingMode = async () => {
    if (isTradingModeBusy) return
    setSettingActionError(null)
    const validation = getTradingModeValidationMessages(pendingTradingMode)
    setTradingModeValidation(validation.messages)
    setTradingModeValidationPassed(validation.ok)
    if (!validation.ok) {
      return
    }
    setIsTradingModeBusy(true)
    try {
      await SettingsService.updateSettingsApiV1SettingsPut({
        requestBody: { key: 'trading_mode', value: pendingTradingMode },
      })
      await SettingsService.updateSettingsApiV1SettingsPut({
        requestBody: { key: 'system.mode', value: pendingTradingMode },
      })
      setSettingValue('trading_mode', pendingTradingMode)
      setSettingValue('system.mode', pendingTradingMode)
      setTradingModeValidation([`Режим успешно переключен на ${pendingTradingMode}.`])
      setTradingModeValidationPassed(true)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Ошибка валидации/переключения режима торговли'
      setSettingActionError(message)
      setTradingModeValidationPassed(false)
    } finally {
      setIsTradingModeBusy(false)
    }
  }

  const applyVirtualCapitalTarget = async () => {
    if (isVirtualCapitalBusy) return
    setSettingActionError(null)
    setIsVirtualCapitalBusy(true)
    try {
      await SettingsService.updateSettingsApiV1SettingsPut({
        requestBody: { key: 'portfolio.virtual.initial_capital', value: TARGET_VIRTUAL_CAPITAL },
      })
      setSettingValue('portfolio.virtual.initial_capital', TARGET_VIRTUAL_CAPITAL)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка обновления виртуального капитала'
      setSettingActionError(message)
    } finally {
      setIsVirtualCapitalBusy(false)
    }
  }

  const pollTaskStatus = async (actionKey: ActionKey, taskId: string, generation: number) => {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
      if (pollGenerationRef.current[actionKey] !== generation) {
        return
      }
      const taskResponse = await SystemService.systemTaskApiV1SystemTasksTaskIdGet({ taskId })
      const data = taskResponse.data as Record<string, unknown>
      const status = String(data.status || 'unknown')
      const error = data.error ? String(data.error) : null
      const errorCode = data.errorCode ? String(data.errorCode) : null
      const timingObj =
        data.timing && typeof data.timing === 'object'
          ? (data.timing as Record<string, unknown>)
          : null
      const durationRaw = Number(timingObj?.durationMs ?? Number.NaN)
      const durationMs = Number.isFinite(durationRaw) ? durationRaw : null
      const resultObj = (data.result || null) as Record<string, unknown> | null
      const progressObj = (resultObj?.progress || null) as Record<string, unknown> | null
      const progressMessage = progressObj?.message ? String(progressObj.message) : null
      const progressStage = formatProgressStage(progressObj)
      const reason = resultObj?.reason ? String(resultObj.reason) : null
      const resultPayload = extractTaskPayload(resultObj)
      const resultLines = formatActionResultLines(actionKey, resultPayload)
      if (pollGenerationRef.current[actionKey] !== generation) {
        return
      }
      if (status === 'queued' || status === 'running') {
        updateAction(actionKey, {
          status: status as TaskStatus,
          error,
          errorCode,
          reason,
          durationMs,
          progressMessage,
          progressStage,
          resultLines: [],
        })
        await new Promise(resolve => window.setTimeout(resolve, POLL_INTERVAL_MS))
        continue
      }
      if (status === 'completed') {
        updateAction(actionKey, {
          status: 'completed',
          error: null,
          errorCode,
          reason,
          durationMs,
          progressMessage: progressMessage || 'Задача завершена',
          progressStage: progressStage || null,
          resultLines,
        })
        return
      }
      updateAction(actionKey, {
        status: 'failed',
        error: error || 'Task failed',
        errorCode,
        reason,
        durationMs,
        progressMessage,
        progressStage,
        resultLines: [],
      })
      return
    }
    if (pollGenerationRef.current[actionKey] !== generation) {
      return
    }
    updateAction(actionKey, {
      status: 'timeout',
      error: 'Polling timeout exceeded',
      errorCode: 'POLL_TIMEOUT',
      reason: 'timeout',
      durationMs: null,
      progressMessage: null,
      progressStage: null,
      resultLines: [],
    })
  }

  const runAction = async (
    actionKey: ActionKey,
    trigger: () => Promise<{ data: Record<string, unknown> }>,
    afterSuccess?: () => Promise<void>
  ) => {
    pollGenerationRef.current[actionKey] = (pollGenerationRef.current[actionKey] ?? 0) + 1
    const generation = pollGenerationRef.current[actionKey]
    try {
      updateAction(actionKey, {
        status: 'queued',
        error: null,
        errorCode: null,
        reason: null,
        durationMs: null,
        taskId: null,
        progressMessage: 'Запускаем задачу...',
        progressStage: null,
        resultLines: [],
      })
      // Даем React отрисовать loader/queued badge до сетевого запроса.
      await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
      const response = await trigger()
      if (pollGenerationRef.current[actionKey] !== generation) {
        return
      }
      const taskId = String(response.data.taskId || '')
      if (!taskId) {
        updateAction(actionKey, { status: 'failed', error: 'taskId отсутствует в ответе' })
        return
      }
      updateAction(actionKey, {
        taskId,
        status: 'queued',
        error: null,
        errorCode: null,
        reason: null,
        durationMs: null,
        progressMessage: 'Задача поставлена в очередь',
        progressStage: null,
        resultLines: [],
      })
      // Основной источник статуса — websocket task.update.
      // Но polling всегда держим как "страховку", чтобы гарантировать terminal status.
      await pollTaskStatus(actionKey, taskId, generation)
      if (pollGenerationRef.current[actionKey] !== generation) {
        return
      }
      if (afterSuccess && mountedRef.current) {
        await afterSuccess()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка запуска фоновой задачи'
      updateAction(actionKey, {
        status: 'failed',
        error: message,
        errorCode: null,
        reason: null,
        durationMs: null,
        progressMessage: null,
        progressStage: null,
        resultLines: [],
      })
    }
  }

  const renderAction = (
    title: string,
    description: string,
    key: ActionKey,
    onClick: () => void
  ) => {
    const action = actions[key]
    const isActive = action.status === 'queued' || action.status === 'running'
    return (
      <div className="settings-page__action" key={key}>
        <Text as="h3" variant="title">
          {title}
        </Text>
        <Text as="p" variant="body" tone="muted">
          {description}
        </Text>
        <div className="settings-page__action-controls">
          <Button onClick={onClick} loading={isActive} disabled={isActive}>
            {action.status === 'queued'
              ? 'Запускаем...'
              : action.status === 'running'
                ? 'Выполняется...'
                : 'Запустить'}
          </Button>
          <span
            className={`settings-page__status-badge settings-page__status-badge--${action.status}`}
          >
            {statusLabel[action.status]}
          </span>
          {action.taskId && (
            <Text as="span" variant="hint" tone="muted">
              taskId: {action.taskId}
            </Text>
          )}
        </div>
        {isActive && (
          <div
            className="settings-page__progress"
            role="progressbar"
            aria-label={`${title} in progress`}
          >
            <div className="settings-page__progress-bar" />
          </div>
        )}
        {action.progressMessage && (
          <Text as="p" variant="hint" tone="muted">
            {action.progressMessage}
          </Text>
        )}
        {action.progressStage && (
          <Text as="p" variant="hint" tone="muted">
            {action.progressStage}
          </Text>
        )}
        {action.resultLines.length > 0 &&
          action.resultLines.map((line, idx) => (
            <Text key={`${key}-result-${idx}`} as="p" variant="hint" tone="muted">
              {line}
            </Text>
          ))}
        {action.reason && (
          <Text as="p" variant="hint" tone="muted">
            Причина: {action.reason}
          </Text>
        )}
        {action.durationMs != null && action.durationMs >= 0 && (
          <Text as="p" variant="hint" tone="muted">
            Длительность: {(action.durationMs / 1000).toFixed(1)}с
          </Text>
        )}
        {action.errorCode && (
          <Text as="p" variant="hint" tone="danger">
            Код ошибки: {action.errorCode}
          </Text>
        )}
        {action.error && (
          <Text as="p" variant="hint" tone="danger">
            {action.error}
          </Text>
        )}
      </div>
    )
  }

  return (
    <PageLayout
      className="settings-page"
      header={
        <SurfaceCard className="settings-page__hero" tone="elevated">
          <Text as="p" variant="eyebrow" tone="muted">
            Система управления
          </Text>
          <Text as="h1" variant="display">
            Настройки
          </Text>
          <Text as="p" variant="body" tone="muted">
            Фоновые операции данных и readonly-вывод системных параметров.
          </Text>
        </SurfaceCard>
      }
      sidebar={
        <Sidebar
          title="Навигация"
          items={APP_SIDEBAR_ITEMS}
          activeItemId={activeSidebarItemId}
          onSelect={handleSidebarSelect}
        />
      }
    >
      <SurfaceCard>
        <div className="settings-page__tabs">
          <Button
            variant={activeTab === 'data' ? 'primary' : 'secondary'}
            onClick={() => setActiveTab('data')}
          >
            Данные
          </Button>
          <Button
            variant={activeTab === 'settings' ? 'primary' : 'secondary'}
            onClick={() => setActiveTab('settings')}
          >
            Настройки
          </Button>
        </div>
      </SurfaceCard>

      {activeTab === 'data' ? (
        <SurfaceCard
          header={
            <Text as="h2" variant="title">
              Вкладка «Данные»
            </Text>
          }
        >
          <div className="settings-page__actions">
            {(hasActiveTasks || hasActiveSocketTasks) && (
              <div className="settings-page__running-banner">
                <Text as="p" variant="label">
                  Идет фоновое выполнение задач. Статусы обновляются автоматически.
                </Text>
              </div>
            )}
            {renderAction(
              'Полная загрузка данных за год',
              'Фоновая подтяжка в базу за последний год: справочник активов и инструментов, исторические свечи (цены), дивиденды, данные по опционам и торговые сигналы. Занимает заметное время — не закрывайте вкладку, статус обновится сам.',
              'fullSyncYear',
              () =>
                void runAction('fullSyncYear', () =>
                  SystemService.systemDataFullSyncYearApiV1SystemDataFullSyncYearPost()
                )
            )}
            <div className="settings-page__meta">
              <Text as="p" variant="hint" tone="muted">
                Последнее обновление кеша: {cacheUpdatedAt || 'нет данных'}
              </Text>
            </div>
            {renderAction(
              'Обновление кеша',
              'Запускает суточный cache update в фоне.',
              'cacheUpdate',
              () =>
                void runAction(
                  'cacheUpdate',
                  () => SystemService.systemCacheUpdateApiV1SystemCacheUpdatePost(),
                  refreshCacheUpdatedAt
                )
            )}
            {renderAction(
              'Быстрое обучение нейросетей',
              'Фоновый запуск quick training через scheduler.',
              'trainingQuick',
              () =>
                void runAction('trainingQuick', () =>
                  SystemService.systemTrainingQuickApiV1SystemTrainingQuickPost()
                )
            )}
            {renderAction(
              'Полное обучение',
              'Фоновый запуск полного обучения по данным БД.',
              'trainingFull',
              () =>
                void runAction('trainingFull', () =>
                  SystemService.systemTrainingFullApiV1SystemTrainingFullPost()
                )
            )}
            {renderAction(
              'Weekly forecast: генерация',
              'Фоновый запуск weekly_generation: генерация weekly forecast через планировщик.',
              'weeklyForecastGeneration',
              () =>
                void runAction('weeklyForecastGeneration', () =>
                  SystemService.systemTrainingWeeklyGenerationApiV1SystemTrainingWeeklyGenerationPost()
                )
            )}
            {renderAction(
              'Weekly forecast: обновление',
              'Фоновый запуск weekly_update: обновление weekly forecast через планировщик.',
              'weeklyForecastUpdate',
              () =>
                void runAction('weeklyForecastUpdate', () =>
                  SystemService.systemTrainingWeeklyUpdateApiV1SystemTrainingWeeklyUpdatePost()
                )
            )}
            {renderAction(
              'Провести анализ',
              'Фоновый анализ рынка и портфеля для подготовки рекомендаций и обновления аналитического контура.',
              'marketAnalysis',
              () =>
                void runAction('marketAnalysis', () =>
                  SystemService.analysisMarketPortfolioApiV1SystemAnalysisMarketPortfolioPost()
                )
            )}
            {renderAction(
              'Проверка деградации моделей',
              'Фоновый weekly backtest для контроля деградации модели.',
              'degradationCheck',
              () =>
                void runAction('degradationCheck', () =>
                  SystemService.governanceWeeklyBacktestApiV1SystemGovernanceWeeklyBacktestPost()
                )
            )}
          </div>
        </SurfaceCard>
      ) : (
        <SurfaceCard
          header={
            <div className="settings-page__settings-header">
              <Text as="h2" variant="title">
                Системные параметры
              </Text>
              <Text as="p" variant="body" tone="muted">
                Только просмотр и одно управляемое переключение (автоторговля paper). Значения
                приходят с сервера; ниже — пояснения простым языком, как на вкладке «Данные».
              </Text>
            </div>
          }
        >
          {settingsLoading ? (
            <Text as="p" variant="body" tone="muted">
              Загрузка...
            </Text>
          ) : settingsError ? (
            <Text as="p" variant="body" tone="danger">
              {settingsError}
            </Text>
          ) : (
            <>
              <div className="settings-page__insights-controls">
                <Button
                  variant="secondary"
                  loading={insightsLoading}
                  disabled={insightsLoading}
                  onClick={() => void loadSettingsInsights()}
                >
                  Обновить сводку
                </Button>
                <Button
                  variant="secondary"
                  loading={isPreflightRunBusy}
                  disabled={isPreflightRunBusy}
                  onClick={() => void runPreflightCheck()}
                >
                  Запустить preflight-проверку
                </Button>
                <div className="settings-page__kpi-periods">
                  <Button
                    variant={analysisKpiWindow === '24h' ? 'primary' : 'secondary'}
                    disabled={insightsLoading}
                    onClick={() => setAnalysisKpiWindow('24h')}
                  >
                    KPI 24ч
                  </Button>
                  <Button
                    variant={analysisKpiWindow === '7d' ? 'primary' : 'secondary'}
                    disabled={insightsLoading}
                    onClick={() => setAnalysisKpiWindow('7d')}
                  >
                    KPI 7д
                  </Button>
                  <Button
                    variant={analysisKpiWindow === '30d' ? 'primary' : 'secondary'}
                    disabled={insightsLoading}
                    onClick={() => setAnalysisKpiWindow('30d')}
                  >
                    KPI 30д
                  </Button>
                </div>
              </div>

              {insightsError && (
                <Text as="p" variant="body" tone="danger">
                  {insightsError}
                </Text>
              )}

              <div className="settings-page__insights-grid">
                <div className="settings-page__insight-card">
                  <Text as="h3" variant="title">
                    Эффективность анализа
                  </Text>
                  <InsightLine
                    label="Окно:"
                    value={analysisKpiSnapshot?.window ?? analysisKpiWindow}
                    tone="accent"
                  />
                  <InsightLine
                    label="Coverage:"
                    value={formatRatioPercent(analysisKpiSnapshot?.coverage)}
                    tone={
                      (analysisKpiSnapshot?.coverage ?? 0) >= 0.9
                        ? 'good'
                        : (analysisKpiSnapshot?.coverage ?? 0) >= 0.75
                          ? 'warn'
                          : 'bad'
                    }
                  />
                  <InsightLine
                    label="Task success rate:"
                    value={formatRatioPercent(analysisKpiSnapshot?.taskSuccessRate)}
                    tone={
                      (analysisKpiSnapshot?.taskSuccessRate ?? 0) >= 0.99
                        ? 'good'
                        : (analysisKpiSnapshot?.taskSuccessRate ?? 0) >= 0.95
                          ? 'warn'
                          : 'bad'
                    }
                  />
                  <InsightLine
                    label="Fallback rate:"
                    value={formatRatioPercent(analysisKpiSnapshot?.fallbackRate)}
                    tone={
                      (analysisKpiSnapshot?.fallbackRate ?? 0) <= 0.2
                        ? 'good'
                        : (analysisKpiSnapshot?.fallbackRate ?? 0) <= 0.35
                          ? 'warn'
                          : 'bad'
                    }
                  />
                  <InsightLine
                    label="Latency p95:"
                    value={
                      analysisKpiSnapshot?.latencyP95Ms != null
                        ? `${Math.round((analysisKpiSnapshot.latencyP95Ms / 1000) * 10) / 10}с`
                        : '—'
                    }
                    tone={
                      (analysisKpiSnapshot?.latencyP95Ms ?? 0) <= 300_000
                        ? 'good'
                        : (analysisKpiSnapshot?.latencyP95Ms ?? 0) <= 900_000
                          ? 'warn'
                          : 'bad'
                    }
                  />
                  <InsightLine
                    label="Fusion accuracy:"
                    value={formatRatioPercent(analysisKpiSnapshot?.directionAccuracyFusion)}
                    tone="accent"
                  />
                  <InsightLine
                    label="Marginal gain LLM:"
                    value={formatRatioPercent(analysisKpiSnapshot?.marginalGainLlmOverNn)}
                    tone={(analysisKpiSnapshot?.marginalGainLlmOverNn ?? 0) >= 0 ? 'good' : 'warn'}
                  />
                  <InsightLine
                    label="LLM skipped unavailable:"
                    value={analysisKpiSnapshot?.llmSkippedUnavailable ?? '—'}
                    tone={
                      (analysisKpiSnapshot?.llmSkippedUnavailable ?? 0) > 0 ? 'warn' : 'good'
                    }
                  />
                  <InsightLine
                    label="Алертов:"
                    value={analysisKpiSnapshot?.alertsCount ?? '—'}
                    tone={(analysisKpiSnapshot?.alertsCount ?? 0) > 0 ? 'bad' : 'good'}
                  />
                </div>

                <div className="settings-page__insight-card">
                  <Text as="h3" variant="title">
                    Состояние сервиса
                  </Text>
                  {(() => {
                    const health = translateHealthStatus(healthSnapshot?.status ?? '—')
                    return (
                      <>
                        <InsightLine label="Статус:" value={health.text} tone={health.tone} />
                        <InsightLine
                          label="Версия:"
                          value={healthSnapshot?.version ?? '—'}
                          tone="accent"
                        />
                        <InsightLine
                          label="Время проверки:"
                          value={formatRuDateTime(healthSnapshot?.timestamp ?? '—')}
                          tone="accent"
                        />
                      </>
                    )
                  })()}
                </div>

                <div className="settings-page__insight-card">
                  <Text as="h3" variant="title">
                    Подсистемы и ресурсы
                  </Text>
                  {(() => {
                    const db = translateSubsystemStatus(runtimeSummary?.databaseStatus ?? '—')
                    const train = translateSubsystemStatus(runtimeSummary?.activeTraining ?? '—')
                    const trade = translateSubsystemStatus(runtimeSummary?.activeTrading ?? '—')
                    const socketState = translateSubsystemStatus(wsConnectionStatus ?? '—')
                    return (
                      <>
                        <InsightLine label="База данных:" value={db.text} tone={db.tone} />
                        <InsightLine label="WebSocket:" value={socketState.text} tone={socketState.tone} />
                        <InsightLine
                          label="Задач в планировщике (сводка):"
                          value={runtimeSummary?.schedulerJobsCount ?? '—'}
                          tone="accent"
                        />
                        <InsightLine label="Обучение моделей:" value={train.text} tone={train.tone} />
                        <InsightLine label="Торговый контур:" value={trade.text} tone={trade.tone} />
                        {(() => {
                          const cpu = mergeResourcePercent(
                            runtimeSummary?.cpuPercent,
                            wsSystemMetrics?.cpuPercent
                          )
                          const ram = mergeResourcePercent(
                            runtimeSummary?.ramPercent,
                            wsSystemMetrics?.ramPercent
                          )
                          return (
                            <>
                              <InsightLine label="Загрузка CPU:" value={cpu.text} tone={cpu.tone} />
                              <InsightLine label="Загрузка RAM:" value={ram.text} tone={ram.tone} />
                            </>
                          )
                        })()}
                      </>
                    )
                  })()}
                </div>

                <div className="settings-page__insight-card">
                  <Text as="h3" variant="title">
                    Риск
                  </Text>
                  {(() => {
                    const emergency = translateBooleanLike(
                      riskSnapshot?.emergencyStop != null && riskSnapshot.emergencyStop !== '—'
                        ? riskSnapshot.emergencyStop
                        : null
                    )
                    return (
                      <InsightLine
                        label="Экстренная остановка:"
                        value={emergency.text}
                        tone={emergency.tone}
                      />
                    )
                  })()}
                  <InsightLine
                    label="Макс. доля на позицию:"
                    value={formatSettingValueLabel(
                      'risk.maxPositionSize',
                      riskSnapshot?.maxPositionSize === '—' || riskSnapshot?.maxPositionSize === undefined
                        ? undefined
                        : riskSnapshot.maxPositionSize
                    )}
                    tone="accent"
                  />
                  <div className="settings-page__insight-card-actions">
                    <Button variant="secondary" size="sm" onClick={() => navigate('/risk')}>
                      Страница риск-менеджмента
                    </Button>
                  </div>
                </div>

                <div className="settings-page__insight-card">
                  <Text as="h3" variant="title">
                    Проверка готовности
                  </Text>
                  {(() => {
                    const pre = translatePreflightOverall(preflightSnapshot?.overallStatus ?? '—')
                    const errCount = preflightSnapshot?.errorsCount
                    return (
                      <>
                        <InsightLine label="Итог:" value={pre.text} tone={pre.tone} />
                        <InsightLine
                          label="Ошибок:"
                          value={errCount === undefined ? '—' : String(errCount)}
                          tone={
                            errCount === undefined ? 'neutral' : errCount > 0 ? 'bad' : 'good'
                          }
                        />
                        <InsightLine
                          label="Время последней проверки:"
                          value={formatRuDateTime(preflightSnapshot?.lastCheck ?? '—')}
                          tone="accent"
                        />
                      </>
                    )
                  })()}
                </div>

                <div className="settings-page__insight-card">
                  <Text as="h3" variant="title">
                    Параметры Келли
                  </Text>
                  {(() => {
                    const kellyEnabled = translateBooleanLike(
                      kellySnapshot?.enabled != null && kellySnapshot.enabled !== '—'
                        ? kellySnapshot.enabled
                        : null
                    )
                    return (
                      <>
                        <InsightLine label="Учёт Келли:" value={kellyEnabled.text} tone={kellyEnabled.tone} />
                        <InsightLine
                          label="Консервативный коэффициент:"
                          value={kellySnapshot?.conservativeFactor ?? '—'}
                          tone="accent"
                        />
                        <InsightLine
                          label="Минимум сделок:"
                          value={kellySnapshot?.minTrades ?? '—'}
                          tone="accent"
                        />
                        <InsightLine
                          label="Период волатильности (дней):"
                          value={kellySnapshot?.volatilityPeriod ?? '—'}
                          tone="accent"
                        />
                      </>
                    )
                  })()}
                </div>

                <div className="settings-page__insight-card">
                  <Text as="h3" variant="title">
                    Планировщик
                  </Text>
                  <InsightLine
                    label="Всего задач:"
                    value={schedulerSnapshot?.jobsTotal ?? '—'}
                    tone="accent"
                  />
                  <InsightLine
                    label="В работе:"
                    value={schedulerSnapshot?.running ?? '—'}
                    tone="good"
                  />
                  <InsightLine
                    label="С ошибкой:"
                    value={schedulerSnapshot?.failed ?? '—'}
                    tone={
                      schedulerSnapshot?.failed === undefined
                        ? 'neutral'
                        : schedulerSnapshot.failed > 0
                          ? 'bad'
                          : 'good'
                    }
                  />
                </div>
              </div>

              <div className="settings-page__settings-list">
                {orderedSettingsItems(settingsItems).map(item => {
                  const presentation = getSettingPresentation(item)
                  return (
                    <div className="settings-page__setting" key={item.key}>
                    {item.key === 'auto_paper_enabled' ? (
                      <div className="settings-page__setting-toggle">
                        <div className="settings-page__setting-main">
                          <Text as="h3" variant="title">
                            {presentation.title}
                          </Text>
                          <Text as="p" variant="body" tone="muted">
                            {presentation.details}
                          </Text>
                          <div className="settings-page__setting-value-row">
                            <Text as="span" variant="label">
                              Сейчас
                            </Text>
                            <Text as="span" variant="body">
                              {readBooleanSetting('auto_paper_enabled') ? 'Включено' : 'Выключено'}
                            </Text>
                          </div>
                          <Text as="p" variant="hint" tone="muted">
                            Ключ API: <code className="settings-page__code">{item.key}</code>
                          </Text>
                        </div>
                        <Switch
                          label="Включено"
                          hint={
                            isAutoPaperBusy
                              ? 'Применяем на сервере...'
                              : 'Включить или выключить автоторговлю в paper'
                          }
                          checked={readBooleanSetting('auto_paper_enabled')}
                          disabled={isAutoPaperBusy}
                          onChange={event => void handleAutoPaperToggle(event.currentTarget.checked)}
                        />
                      </div>
                    ) : (
                      <div className="settings-page__setting-main">
                        <Text as="h3" variant="title">
                          {presentation.title}
                        </Text>
                        <Text as="p" variant="body" tone="muted">
                          {presentation.details}
                        </Text>
                        <div className="settings-page__setting-value-row">
                          <Text as="span" variant="label">
                            Текущее значение
                          </Text>
                          <Text as="p" variant="body">
                            {formatSettingValueLabel(item.key, item.value)}
                          </Text>
                        </div>
                        {item.key === 'trading_mode' && (
                          <div className="settings-page__trading-mode-panel">
                            <div className="settings-page__trading-mode-buttons">
                              {(['paper', 'micro', 'real'] as TradingMode[]).map(mode => (
                                <Button
                                  key={mode}
                                  variant={pendingTradingMode === mode ? 'primary' : 'secondary'}
                                  disabled={isTradingModeBusy}
                                  onClick={() => setPendingTradingMode(mode)}
                                >
                                  {mode}
                                </Button>
                              ))}
                            </div>
                            <div className="settings-page__trading-mode-actions">
                              <Button
                                loading={isTradingModeBusy}
                                disabled={isTradingModeBusy}
                                onClick={() => void validateAndApplyTradingMode()}
                              >
                                Проверить и переключить режим
                              </Button>
                              {tradingModeValidation.length > 0 && (
                                <div
                                  className={`settings-page__validation ${
                                    tradingModeValidationPassed
                                      ? 'settings-page__validation--ok'
                                      : 'settings-page__validation--error'
                                  }`}
                                >
                                  {tradingModeValidation.map(message => (
                                    <Text as="p" variant="hint" key={message}>
                                      {message}
                                    </Text>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {item.key === 'portfolio.virtual.initial_capital' && (
                          <div className="settings-page__trading-mode-panel">
                            <div className="settings-page__setting-value-row">
                              <Text as="span" variant="label">
                                Целевое значение
                              </Text>
                              <Text as="span" variant="body">
                                {new Intl.NumberFormat('ru-RU').format(TARGET_VIRTUAL_CAPITAL)}
                              </Text>
                            </div>
                            <div className="settings-page__trading-mode-actions">
                              <Button
                                variant="secondary"
                                loading={isVirtualCapitalBusy}
                                disabled={isVirtualCapitalBusy}
                                onClick={() => void applyVirtualCapitalTarget()}
                              >
                                Установить 50 000 000
                              </Button>
                            </div>
                          </div>
                        )}
                        <Text as="p" variant="hint" tone="muted">
                          Ключ API: <code className="settings-page__code">{item.key}</code>
                          {item.module ? (
                            <>
                              {' '}
                              · модуль: {item.module}
                            </>
                          ) : null}
                        </Text>
                      </div>
                    )}
                    </div>
                  )
                })}
                {settingActionError && (
                  <Text as="p" variant="body" tone="danger">
                    {settingActionError}
                  </Text>
                )}
                {settingsItems.length === 0 && (
                  <Text as="p" variant="body" tone="muted">
                    Настройки не найдены.
                  </Text>
                )}
              </div>
            </>
          )}
        </SurfaceCard>
      )}
    </PageLayout>
  )
}
