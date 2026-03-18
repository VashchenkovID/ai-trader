import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SystemService } from '@/api/generated/services/SystemService'
import { Button, PageLayout, Sidebar, SurfaceCard, Text, type SidebarItem } from '@/components/ui'
import { useSystemStatusStore } from '@/store/systemStatusStore'
import './SettingsPage.scss'

type TabId = 'data' | 'settings'
type ActionKey = 'fullSyncYear' | 'cacheUpdate' | 'trainingQuick' | 'trainingFull'
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

const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 180

const sidebarItems: SidebarItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'signals', label: 'Signals' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'settings', label: 'Settings' },
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
  const [activeTab, setActiveTab] = useState<TabId>('data')
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState<string | null>(null)
  const [settingsItems, setSettingsItems] = useState<SystemSetting[]>([])
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [actions, setActions] = useState<Record<ActionKey, ActionState>>({
    fullSyncYear: initialActionState,
    cacheUpdate: initialActionState,
    trainingQuick: initialActionState,
    trainingFull: initialActionState,
  })
  const socketTasks = useSystemStatusStore(state => state.tasks)

  const activeSidebarItemId = location.pathname.startsWith('/settings') ? 'settings' : 'overview'
  const hasActiveTasks = Object.values(actions).some(
    action => action.status === 'queued' || action.status === 'running'
  )
  const hasActiveSocketTasks = socketTasks.some(task =>
    ['full_db_sync_year', 'cache_update', 'training_quick', 'training_full'].includes(task.taskType) &&
    ['queued', 'running'].includes(task.status)
  )

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!socketTasks.length) return
    setActions(prev => {
      const byTaskType: Record<string, ActionKey> = {
        full_db_sync_year: 'fullSyncYear',
        cache_update: 'cacheUpdate',
        training_quick: 'trainingQuick',
        training_full: 'trainingFull',
      }
      let changed = false
      const next = { ...prev }
      for (const task of socketTasks) {
        const actionKey = byTaskType[task.taskType]
        if (!actionKey) continue
        const current = next[actionKey]
        const shouldAttachTask = !current.taskId || current.taskId === task.taskId
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

  useEffect(() => {
    void refreshCacheUpdatedAt()
    void loadSettings()
  }, [])

  const pollTaskStatus = async (actionKey: ActionKey, taskId: string) => {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
      const taskResponse = await SystemService.systemTaskApiV1SystemTasksTaskIdGet({ taskId })
      const data = taskResponse.data as Record<string, unknown>
      const status = String(data.status || 'unknown')
      const error = data.error ? String(data.error) : null
      const resultObj = (data.result || null) as Record<string, unknown> | null
      const progressObj = (resultObj?.progress || null) as Record<string, unknown> | null
      const progressMessage = progressObj?.message ? String(progressObj.message) : null
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
    updateAction(actionKey, { status: 'timeout', error: 'Polling timeout exceeded', progressMessage: null })
  }

  const runAction = async (
    actionKey: ActionKey,
    trigger: () => Promise<{ data: Record<string, unknown> }>,
    afterSuccess?: () => Promise<void>
  ) => {
    try {
      updateAction(actionKey, { status: 'queued', error: null, taskId: null, progressMessage: null })
      const response = await trigger()
      const taskId = String(response.data.taskId || '')
      if (!taskId) {
        updateAction(actionKey, { status: 'failed', error: 'taskId отсутствует в ответе' })
        return
      }
      updateAction(actionKey, { taskId, status: 'queued', error: null, progressMessage: 'Задача поставлена в очередь' })
      // Основной источник статуса — websocket task.update.
      // Но polling всегда держим как "страховку", чтобы гарантировать terminal status.
      await pollTaskStatus(actionKey, taskId)
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
            System controls
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
          title="Navigation"
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
              'Полная загрузка БД за год',
              'Запуск полной фоновой синхронизации: assets/instruments/candles/dividends/options/signals.',
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
          </div>
        </SurfaceCard>
      ) : (
        <SurfaceCard
          header={
            <Text as="h2" variant="title">
              Вкладка «Настройки» (readonly)
            </Text>
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
            <div className="settings-page__settings-list">
              {settingsItems.map(item => (
                <div className="settings-page__setting" key={item.key}>
                  <Text as="p" variant="label">
                    {item.key}
                  </Text>
                  <Text as="p" variant="body" tone="muted">
                    {item.value === null ? 'null' : JSON.stringify(item.value)}
                  </Text>
                  {(item.module || item.description) && (
                    <Text as="p" variant="hint" tone="muted">
                      {[item.module, item.description].filter(Boolean).join(' | ')}
                    </Text>
                  )}
                </div>
              ))}
              {settingsItems.length === 0 && (
                <Text as="p" variant="body" tone="muted">
                  Настройки не найдены.
                </Text>
              )}
            </div>
          )}
        </SurfaceCard>
      )}
    </PageLayout>
  )
}
