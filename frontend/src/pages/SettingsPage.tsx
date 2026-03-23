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
  type SidebarItem,
} from '@/components/ui'
import { useSystemStatusStore } from '@/store/systemStatusStore'
import { cn } from '@/utils/cn'
import './SettingsPage.scss'

type TabId = 'data' | 'settings'
type ActionKey =
  | 'fullSyncYear'
  | 'cacheUpdate'
  | 'trainingQuick'
  | 'trainingFull'
  | 'degradationCheck'
type TaskStatus = 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'timeout'

type ActionState = {
  taskId: string | null
  status: TaskStatus
  error: string | null
  progressMessage: string | null
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

/** Порядок вывода известных ключей; остальные — по алфавиту после них. */
const SETTINGS_DISPLAY_ORDER = [
  'trading_mode',
  'auto_paper_enabled',
  'system.mode',
  'risk.maxPositionSize',
] as const

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
    return String(value)
  }
  if (typeof value === 'string') {
    if (key === 'trading_mode' || key === 'system.mode') {
      return formatTradingModeValue(value)
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

/** Типы фоновых задач (вкладка «Данные» / system-status WS). */
const MONITORED_BACKGROUND_TASK_TYPES = new Set([
  'full_db_sync_year',
  'cache_update',
  'training_quick',
  'training_full',
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

const sidebarItems: SidebarItem[] = [
  { id: 'dashboard', label: 'Главная' },
  { id: 'settings', label: 'Настройки' },
]

const initialActionState: ActionState = {
  taskId: null,
  status: 'idle',
  error: null,
  progressMessage: null,
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
  const [pendingTradingMode, setPendingTradingMode] = useState<TradingMode>('paper')
  const [isTradingModeBusy, setIsTradingModeBusy] = useState(false)
  const [tradingModeValidation, setTradingModeValidation] = useState<string[]>([])
  const [tradingModeValidationPassed, setTradingModeValidationPassed] = useState(false)
  const [actions, setActions] = useState<Record<ActionKey, ActionState>>({
    fullSyncYear: initialActionState,
    cacheUpdate: initialActionState,
    trainingQuick: initialActionState,
    trainingFull: initialActionState,
    degradationCheck: initialActionState,
  })
  const socketTasks = useSystemStatusStore(state => state.tasks)
  const wsSystemMetrics = useSystemStatusStore(state => state.snapshot?.system)

  const activeSidebarItemId = location.pathname.startsWith('/settings') ? 'settings' : 'dashboard'
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
        if (
          current.taskId !== task.taskId ||
          current.status !== mappedStatus ||
          current.error !== nextError ||
          current.progressMessage !== progressMessage
        ) {
          next[actionKey] = {
            taskId: task.taskId,
            status: mappedStatus,
            error: nextError,
            progressMessage,
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
    if (itemId === 'settings') {
      navigate('/settings')
      return
    }
    navigate('/dashboard')
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
      const [healthRes, statusRes, schedulerRes, kellyRes, riskRes, preflightRes] = await Promise.all([
        SystemService.systemHealthApiV1SystemHealthGet(),
        SystemService.systemStatusApiV1SystemStatusGet(),
        SystemService.systemSchedulerStatusApiV1SystemSchedulerStatusGet(),
        SettingsService.getKellySettingsApiV1SettingsKellyGet(),
        RiskService.riskStatusApiV1RiskStatusGet(),
        PreflightCheckService.preflightResultsApiV1PreflightCheckResultsGet(),
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
    void loadSettingsInsights()
  }, [])

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

  const pollTaskStatus = async (actionKey: ActionKey, taskId: string, generation: number) => {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
      if (pollGenerationRef.current[actionKey] !== generation) {
        return
      }
      const taskResponse = await SystemService.systemTaskApiV1SystemTasksTaskIdGet({ taskId })
      const data = taskResponse.data as Record<string, unknown>
      const status = String(data.status || 'unknown')
      const error = data.error ? String(data.error) : null
      const resultObj = (data.result || null) as Record<string, unknown> | null
      const progressObj = (resultObj?.progress || null) as Record<string, unknown> | null
      const progressMessage = progressObj?.message ? String(progressObj.message) : null
      if (pollGenerationRef.current[actionKey] !== generation) {
        return
      }
      if (status === 'queued' || status === 'running') {
        updateAction(actionKey, { status: status as TaskStatus, error, progressMessage })
        await new Promise(resolve => window.setTimeout(resolve, POLL_INTERVAL_MS))
        continue
      }
      if (status === 'completed') {
        updateAction(actionKey, { status: 'completed', error: null, progressMessage: null })
        return
      }
      updateAction(actionKey, { status: 'failed', error: error || 'Task failed', progressMessage })
      return
    }
    if (pollGenerationRef.current[actionKey] !== generation) {
      return
    }
    updateAction(actionKey, {
      status: 'timeout',
      error: 'Polling timeout exceeded',
      progressMessage: null,
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
        taskId: null,
        progressMessage: null,
      })
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
        progressMessage: 'Задача поставлена в очередь',
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
      updateAction(actionKey, { status: 'failed', error: message, progressMessage: null })
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
          <Button onClick={onClick} loading={isActive}>
            {isActive ? 'Выполняется...' : 'Запустить'}
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
          items={sidebarItems}
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
              </div>

              {insightsError && (
                <Text as="p" variant="body" tone="danger">
                  {insightsError}
                </Text>
              )}

              <div className="settings-page__insights-grid">
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
                    return (
                      <>
                        <InsightLine label="База данных:" value={db.text} tone={db.tone} />
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
