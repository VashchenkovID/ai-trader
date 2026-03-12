import { create } from 'zustand'
import { resolveApiBaseUrl } from '@/api/config'
import { useTradingCoreStore } from '@/store/tradingCoreStore'

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

type SchedulerJobState = {
  name: string
  status: string
  lastRunAt?: string | null
  lastSuccessAt?: string | null
  lastError?: string | null
  lastDurationMs?: number | null
}

type TaskRecord = {
  taskId: string
  taskType: string
  status: string
  queuedAt?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  error?: string | null
  result?: Record<string, unknown> | null
  source?: string | null
}

type SystemSnapshotPayload = {
  system: {
    cpuPercent: number
    ramPercent: number
    pid: number
    timestamp: string
  }
  workers: {
    running: number
    failed: number
    completed: number
  }
  scheduler: Record<string, SchedulerJobState>
  tasks: TaskRecord[]
}

type WsEnvelope = {
  event: string
  sequence: number
  timestamp: string
  payload: Record<string, unknown>
}

type SystemStatusState = {
  connectionStatus: ConnectionStatus
  lastError: string | null
  lastEventAt: string | null
  sequence: number
  snapshot: SystemSnapshotPayload | null
  scheduler: Record<string, SchedulerJobState>
  tasks: TaskRecord[]
  connect: () => void
  disconnect: () => void
}

const WS_PATH =
  (import.meta.env.VITE_WS_SYSTEM_STATUS_PATH as string | undefined)?.trim() ||
  '/api/v1/ws/system-status'
const MAX_TASKS = 50

let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempt = 0
let manuallyClosed = false
let portfolioRefreshTimer: ReturnType<typeof setTimeout> | null = null

const ensureTrailingSlash = (value: string) => (value.endsWith('/') ? value : `${value}/`)

const toWsUrl = () => {
  const httpBase = resolveApiBaseUrl()
  const url = new URL(WS_PATH.replace(/^\//, ''), ensureTrailingSlash(httpBase))
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

const resetReconnectTimer = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

const scheduleReconnect = () => {
  resetReconnectTimer()
  reconnectAttempt += 1
  const delayMs = Math.min(30000, 1000 * 2 ** (reconnectAttempt - 1))
  reconnectTimer = setTimeout(() => {
    useSystemStatusStore.getState().connect()
  }, delayMs)
}

const setConnectionStatus = (status: ConnectionStatus, error: string | null = null) => {
  useSystemStatusStore.setState({ connectionStatus: status, lastError: error })
}

const isSchedulerLikeEvent = (event: string) =>
  event === 'scheduler.status' ||
  event === 'training.status' ||
  event === 'analysis.status' ||
  event === 'workers.registry'

const shouldRefreshPortfolioByEvent = (message: WsEnvelope) => {
  if (message.event === 'system.snapshot' || message.event === 'system.heartbeat') return true

  const job = message.payload.job as Record<string, unknown> | undefined
  const task = message.payload.task as Record<string, unknown> | undefined
  const jobName = String(job?.name ?? '')
  const taskType = String(task?.taskType ?? '')

  const keys = [
    'portfolio',
    'position_monitoring',
    'trailing_stops',
    'partial_exit',
    'active_signals_prices_update',
    'trading_requests_prices_update',
  ]
  return keys.some(key => jobName.includes(key) || taskType.includes(key))
}

const schedulePortfolioRefresh = () => {
  if (portfolioRefreshTimer) return
  portfolioRefreshTimer = setTimeout(async () => {
    portfolioRefreshTimer = null
    try {
      await useTradingCoreStore.getState().refreshPortfolio('socket')
    } catch {
      // ignore websocket-triggered refresh errors
    }
  }, 500)
}

const normalizeTask = (task: Record<string, unknown>): TaskRecord => ({
  taskId: String(task.taskId ?? ''),
  taskType: String(task.taskType ?? ''),
  status: String(task.status ?? ''),
  queuedAt: (task.queuedAt as string | null | undefined) ?? null,
  startedAt: (task.startedAt as string | null | undefined) ?? null,
  finishedAt: (task.finishedAt as string | null | undefined) ?? null,
  error: (task.error as string | null | undefined) ?? null,
  result: (task.result as Record<string, unknown> | null | undefined) ?? null,
  source: (task.source as string | null | undefined) ?? null,
})

const applyWsEvent = (message: WsEnvelope) => {
  const { event, timestamp, sequence } = message
  useSystemStatusStore.setState(prev => {
    let nextScheduler = prev.scheduler
    let nextTasks = prev.tasks
    let nextSnapshot = prev.snapshot

    if (event === 'system.snapshot' || event === 'system.heartbeat') {
      const snapshotPayload = message.payload as unknown as SystemSnapshotPayload
      nextSnapshot = snapshotPayload
      nextScheduler = snapshotPayload.scheduler ?? {}
      nextTasks = snapshotPayload.tasks ?? []
    }

    if (isSchedulerLikeEvent(event) && message.payload.job) {
      const job = message.payload.job as unknown as SchedulerJobState
      if (job?.name) {
        nextScheduler = {
          ...nextScheduler,
          [job.name]: job,
        }
      }
    }

    if (event === 'task.update' && message.payload.task) {
      const task = normalizeTask(message.payload.task as Record<string, unknown>)
      if (task.taskId) {
        const rest = nextTasks.filter(existing => existing.taskId !== task.taskId)
        nextTasks = [task, ...rest].slice(0, MAX_TASKS)
      }
    }

    return {
      ...prev,
      sequence,
      lastEventAt: timestamp,
      snapshot: nextSnapshot,
      scheduler: nextScheduler,
      tasks: nextTasks,
    }
  })

  if (shouldRefreshPortfolioByEvent(message)) {
    schedulePortfolioRefresh()
  }
}

export const useSystemStatusStore = create<SystemStatusState>(() => ({
  connectionStatus: 'idle',
  lastError: null,
  lastEventAt: null,
  sequence: -1,
  snapshot: null,
  scheduler: {},
  tasks: [],

  connect: () => {
    if (typeof window === 'undefined') return
    if (
      socket &&
      (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
    )
      return

    manuallyClosed = false
    setConnectionStatus(reconnectAttempt > 0 ? 'reconnecting' : 'connecting')

    try {
      socket = new WebSocket(toWsUrl())
    } catch {
      setConnectionStatus('error', 'Не удалось создать WebSocket соединение')
      scheduleReconnect()
      return
    }

    socket.onopen = () => {
      reconnectAttempt = 0
      resetReconnectTimer()
      setConnectionStatus('connected')
    }

    socket.onmessage = event => {
      try {
        const message = JSON.parse(event.data) as WsEnvelope
        applyWsEvent(message)
      } catch {
        setConnectionStatus('error', 'Ошибка парсинга WebSocket сообщения')
      }
    }

    socket.onerror = () => {
      setConnectionStatus('error', 'Ошибка WebSocket соединения')
    }

    socket.onclose = () => {
      socket = null
      if (manuallyClosed) {
        setConnectionStatus('idle')
        return
      }
      scheduleReconnect()
    }
  },

  disconnect: () => {
    manuallyClosed = true
    resetReconnectTimer()
    reconnectAttempt = 0
    if (socket) {
      socket.close()
      socket = null
    }
    setConnectionStatus('idle', null)
  },
}))
