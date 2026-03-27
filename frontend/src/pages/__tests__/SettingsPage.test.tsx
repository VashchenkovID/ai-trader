import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SettingsPage } from '../SettingsPage'
import { AutoPaperTradingService } from '@/api/generated/services/AutoPaperTradingService'
import { PreflightCheckService } from '@/api/generated/services/PreflightCheckService'
import { RiskService } from '@/api/generated/services/RiskService'
import { SettingsService } from '@/api/generated/services/SettingsService'
import { SystemService } from '@/api/generated/services/SystemService'

type MockSocketTask = {
  taskId: string
  taskType: string
  status: string
  error: string | null
  result: Record<string, unknown> | null
}

const mockSocketState: {
  tasks: MockSocketTask[]
  connectionStatus: string
} = {
  tasks: [],
  connectionStatus: 'idle',
}

jest.mock('@/store/systemStatusStore', () => ({
  useSystemStatusStore: (selector: (state: typeof mockSocketState) => unknown) =>
    selector(mockSocketState),
}))

async function clickActionRunButton(title: string): Promise<void> {
  const heading = await screen.findByRole('heading', { name: title })
  const card = heading.closest('.settings-page__action')
  if (!card) throw new Error(`Action card not found for title: ${title}`)
  const button = card.querySelector('button')
  if (!button) throw new Error(`Run button not found for title: ${title}`)
  await userEvent.click(button)
}

async function clickSettingsTab(): Promise<void> {
  const tabs = document.querySelector('.settings-page__tabs')
  if (!tabs) throw new Error('Tabs container not found')
  const button = within(tabs as HTMLElement).getByRole('button', { name: 'Настройки' })
  await userEvent.click(button)
}

describe('SettingsPage', () => {
  beforeEach(() => {
    mockSocketState.tasks = []
    jest.spyOn(SystemService, 'systemTasksApiV1SystemTasksGet').mockResolvedValue({
      success: true,
      data: { items: [], meta: { limit: 200 } },
    })
    jest.spyOn(SystemService, 'systemSettingsApiV1SystemSettingsGet').mockResolvedValue({
      success: true,
      data: {
        items: [
          { key: 'system.mode', value: 'paper', module: 'core', description: 'mode' },
          {
            key: 'auto_paper_enabled',
            value: false,
            module: 'trading',
            description: 'auto paper',
          },
          {
            key: 'portfolio.virtual.initial_capital',
            value: '1000000',
            module: 'portfolio',
            description: 'virtual capital',
          },
        ],
        meta: { offset: 0, limit: 1000, total: 3 },
      },
    })
    jest.spyOn(SystemService, 'systemHealthApiV1SystemHealthGet').mockResolvedValue({
      success: true,
      data: { status: 'healthy', version: 'test', timestamp: '2026-01-01T00:00:00Z' },
    } as never)
    jest.spyOn(SystemService, 'systemStatusApiV1SystemStatusGet').mockResolvedValue({
      success: true,
      data: {
        database: { status: 'connected' },
        neuralNetwork: { status: 'idle' },
        trading: { status: 'idle' },
        schedulerJobs: {},
        resources: { cpuPercent: '10', ramPercent: '20' },
      },
    } as never)
    jest.spyOn(SystemService, 'systemSchedulerStatusApiV1SystemSchedulerStatusGet').mockResolvedValue({
      success: true,
      data: { jobs: [] },
    } as never)
    jest.spyOn(SettingsService, 'getKellySettingsApiV1SettingsKellyGet').mockResolvedValue({
      success: true,
      data: { enabled: false, conservativeFactor: 0.5, minTrades: 20, volatilityPeriod: 30 },
    } as never)
    jest.spyOn(RiskService, 'riskStatusApiV1RiskStatusGet').mockResolvedValue({
      success: true,
      data: { emergencyStop: false, limits: { maxPositionSize: 0.1 } },
    } as never)
    jest
      .spyOn(PreflightCheckService, 'preflightResultsApiV1PreflightCheckResultsGet')
      .mockResolvedValue({
        success: true,
        data: { overallStatus: 'passed', timestamp: '2026-01-01T00:00:00Z', errors: [] },
      } as never)
    ;(SystemService as unknown as Record<string, unknown>).analysisKpiApiV1SystemAnalysisKpiGet =
      jest.fn().mockResolvedValue({
        success: true,
        data: {
          window: '7d',
          report: {
            operability: { coverage: 1, taskSuccessRate: 1 },
            fusion: { fallbackRate: 0, marginalGainLlmOverNn: 0, llmSkippedUnavailable: 0 },
            quality: { directionAccuracyFusion: 0.5 },
            summary: { latencyP95Ms: 1000 },
          },
          alerts: { count: 0 },
        },
      })
    ;(
      SystemService as unknown as Record<string, unknown>
    ).systemTrainingWeeklyGenerationApiV1SystemTrainingWeeklyGenerationPost = jest
      .fn()
      .mockResolvedValue({
        success: true,
        data: { taskId: 'weekly-default', status: 'scheduled' },
      })
    ;(SystemService as unknown as Record<string, unknown>).systemTrainingWeeklyUpdateApiV1SystemTrainingWeeklyUpdatePost =
      jest.fn().mockResolvedValue({
        success: true,
        data: { taskId: 'weekly-update-default', status: 'scheduled' },
      })
  })

  afterEach(() => {
    delete (SystemService as unknown as Record<string, unknown>).analysisKpiApiV1SystemAnalysisKpiGet
    delete (SystemService as unknown as Record<string, unknown>)
      .systemTrainingWeeklyGenerationApiV1SystemTrainingWeeklyGenerationPost
    delete (SystemService as unknown as Record<string, unknown>)
      .systemTrainingWeeklyUpdateApiV1SystemTrainingWeeklyUpdatePost
    jest.restoreAllMocks()
  })

  it('renders tabs and readonly settings', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    )

    expect(screen.getByText('Вкладка «Данные»')).toBeInTheDocument()
    await clickSettingsTab()
    await waitFor(() => expect(screen.getByText('Системные параметры')).toBeInTheDocument())
    expect(screen.getByText('system.mode')).toBeInTheDocument()
  })

  it('starts full sync and polls task status', async () => {
    const pollMock = jest
      .spyOn(SystemService, 'systemTaskApiV1SystemTasksTaskIdGet')
      .mockResolvedValueOnce({
        success: true,
        data: { taskId: 'task-1', status: 'completed' },
      })
    jest
      .spyOn(SystemService, 'systemDataFullSyncYearApiV1SystemDataFullSyncYearPost')
      .mockResolvedValue({
        success: true,
        data: { taskId: 'task-1', status: 'scheduled' },
      })

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    )

    await clickActionRunButton('Полная загрузка данных за год')
    await waitFor(() => expect(screen.getByText(/taskId: task-1/)).toBeInTheDocument())
    await waitFor(() => expect(pollMock).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('Завершено')).toBeInTheDocument())
  })

  it('does not re-apply stale failed websocket task when restarting quick training', async () => {
    mockSocketState.tasks = [
      {
        taskId: 'old-task',
        taskType: 'training_quick',
        status: 'failed',
        error: 'mat1 and mat2 shapes',
        result: null,
      },
    ]
    let resolvePost: (value: { success: boolean; data: { taskId: string } }) => void = () => {}
    const postPromise: Promise<{ success: boolean; data: { taskId: string } }> = new Promise(
      resolve => {
        resolvePost = resolve
      }
    )
    jest
      .spyOn(SystemService, 'systemTrainingQuickApiV1SystemTrainingQuickPost')
      .mockImplementation(
        () =>
          postPromise as unknown as ReturnType<
            typeof SystemService.systemTrainingQuickApiV1SystemTrainingQuickPost
          >
      )
    jest.spyOn(SystemService, 'systemTaskApiV1SystemTasksTaskIdGet').mockResolvedValue({
      success: true,
      data: { taskId: 'new-task', status: 'completed' },
    })

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    )

    await clickActionRunButton('Быстрое обучение нейросетей')

    await waitFor(() => expect(screen.getByText('В очереди')).toBeInTheDocument())
    expect(screen.queryByText(/mat1/)).not.toBeInTheDocument()

    resolvePost({ success: true, data: { taskId: 'new-task' } })
    await waitFor(() => expect(screen.getByText('Завершено')).toBeInTheDocument())
  })

  it('toggles auto_paper_enabled on settings tab', async () => {
    const enableMock = jest
      .spyOn(AutoPaperTradingService, 'autoPaperEnableApiV1AutoPaperTradingEnablePost')
      .mockResolvedValue({ success: true, data: { message: 'ok' } })
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    )
    await clickSettingsTab()
    const toggles = await screen.findAllByRole('switch')
    const toggle = toggles[0]
    expect(toggle).not.toBeChecked()
    await userEvent.click(toggle)
    await waitFor(() => expect(enableMock).toHaveBeenCalled())
    await waitFor(() => expect(toggle).toBeChecked())
  })

  it('starts degradation check and polls status', async () => {
    const pollMock = jest
      .spyOn(SystemService, 'systemTaskApiV1SystemTasksTaskIdGet')
      .mockResolvedValue({
        success: true,
        data: { taskId: 'deg-1', status: 'completed' },
      })
    jest
      .spyOn(SystemService, 'governanceWeeklyBacktestApiV1SystemGovernanceWeeklyBacktestPost')
      .mockResolvedValue({
        success: true,
        data: { taskId: 'deg-1', status: 'scheduled' },
      })

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    )

    await clickActionRunButton('Проверка деградации моделей')
    await waitFor(() => expect(screen.getByText(/taskId: deg-1/)).toBeInTheDocument())
    await waitFor(() => expect(pollMock).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('Завершено')).toBeInTheDocument())
  })

  it('renders detailed weekly generation summary', async () => {
    ;(
      SystemService as unknown as Record<string, unknown>
    ).systemTrainingWeeklyGenerationApiV1SystemTrainingWeeklyGenerationPost = jest.fn().mockResolvedValue({
        success: true,
        data: { taskId: 'weekly-1', status: 'scheduled' },
      })
    jest.spyOn(SystemService, 'systemTaskApiV1SystemTasksTaskIdGet').mockResolvedValue({
      success: true,
      data: {
        taskId: 'weekly-1',
        status: 'completed',
        result: {
          result: {
            message: 'weekly generation completed',
            mlflowRunId: 'mlf-123',
            processedUniverse: 'all_instruments',
            instrumentTotal: 120,
            instrumentEligible: 90,
            instrumentSkipped: 30,
            rowsTotal: 24000,
            rowsUsed: 21000,
            rowsSkipped: 3000,
            resumeFromLatest: false,
            skipReasons: { insufficient_candles: 22, missing_data: 8 },
            parameters: { epochs: 12, batchSize: 32, lr: 0.001, seqLen: 30, nForecast: 5 },
          },
        },
      },
    })

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    )

    await clickActionRunButton('Weekly forecast: генерация')
    await waitFor(() => expect(screen.getByText(/taskId: weekly-1/)).toBeInTheDocument())
    await waitFor(() =>
      expect(screen.getByText(/Охват universe: 120 инструментов/)).toBeInTheDocument()
    )
    await waitFor(() =>
      expect(screen.getByText(/Подошло к обучению: 90, пропущено: 30/)).toBeInTheDocument()
    )
    await waitFor(() =>
      expect(
        screen.getByText(/Причины пропусков: insufficient_candles: 22, missing_data: 8/)
      ).toBeInTheDocument()
    )
    await waitFor(() => expect(screen.getByText(/MLflow run: mlf-123/)).toBeInTheDocument())
  })

  it('renders quick training meta/ensemble summary', async () => {
    jest.spyOn(SystemService, 'systemTrainingQuickApiV1SystemTrainingQuickPost').mockResolvedValue({
      success: true,
      data: { taskId: 'quick-1', status: 'scheduled' },
    })
    jest.spyOn(SystemService, 'systemTaskApiV1SystemTasksTaskIdGet').mockResolvedValue({
      success: true,
      data: {
        taskId: 'quick-1',
        status: 'completed',
        timing: { durationMs: 12340 },
        result: {
          reason: 'completed',
          result: {
            message: 'quick training completed',
            mlflowRunId: 'mlf-q1',
            totalInstruments: 40,
            trainedInstruments: 31,
            skippedInstruments: 9,
            metaSucceeded: 28,
            metaFailed: 3,
          },
        },
      },
    })

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    )

    await clickActionRunButton('Быстрое обучение нейросетей')
    await waitFor(() =>
      expect(screen.getByText(/Инструменты: всего 40, обучено 31, пропущено 9/)).toBeInTheDocument()
    )
    await waitFor(() =>
      expect(screen.getByText(/Meta\/ensemble: успешно 28, с ошибкой 3/)).toBeInTheDocument()
    )
    await waitFor(() => expect(screen.getByText(/Причина: completed/)).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText(/Длительность: 12.3с/)).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText(/MLflow run: mlf-q1/)).toBeInTheDocument())
  })

  it('renders full training meta/ensemble summary', async () => {
    jest.spyOn(SystemService, 'systemTrainingFullApiV1SystemTrainingFullPost').mockResolvedValue({
      success: true,
      data: { taskId: 'full-1', status: 'scheduled' },
    })
    jest.spyOn(SystemService, 'systemTaskApiV1SystemTasksTaskIdGet').mockResolvedValue({
      success: true,
      data: {
        taskId: 'full-1',
        status: 'completed',
        result: {
          result: {
            message: 'full training completed',
            mlflowRunId: 'mlf-f1',
            totalInstruments: 60,
            trainedInstruments: 50,
            skippedInstruments: 10,
            metaSucceeded: 44,
            metaFailed: 6,
          },
        },
      },
    })

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    )

    await clickActionRunButton('Полное обучение')
    await waitFor(() =>
      expect(
        screen.getByText(/Инструменты: всего 60, обучено 50, пропущено 10/)
      ).toBeInTheDocument()
    )
    await waitFor(() =>
      expect(screen.getByText(/Meta\/ensemble: успешно 44, с ошибкой 6/)).toBeInTheDocument()
    )
    await waitFor(() => expect(screen.getByText(/MLflow run: mlf-f1/)).toBeInTheDocument())
  })

  it('blocks switching to real when auto paper is enabled', async () => {
    jest.spyOn(SystemService, 'systemSettingsApiV1SystemSettingsGet').mockResolvedValue({
      success: true,
      data: {
        items: [
          { key: 'trading_mode', value: 'paper', module: 'core', description: 'mode' },
          { key: 'system.mode', value: 'paper', module: 'core', description: 'mode' },
          { key: 'auto_paper_enabled', value: true, module: 'trading', description: 'auto paper' },
          { key: 'risk.maxPositionSize', value: 0.05, module: 'risk', description: 'risk' },
        ],
        meta: { offset: 0, limit: 1000, total: 4 },
      },
    })
    const updateSpy = jest
      .spyOn(SettingsService, 'updateSettingsApiV1SettingsPut')
      .mockResolvedValue({ success: true, data: { key: 'x', value: 'y' } } as never)

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    )
    await clickSettingsTab()

    await userEvent.click(await screen.findByRole('button', { name: 'real' }))
    await userEvent.click(screen.getByRole('button', { name: 'Проверить и переключить режим' }))

    expect(
      await screen.findByText('Для режима real сначала выключите auto paper.')
    ).toBeInTheDocument()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('switches trading mode when validation passes', async () => {
    jest.spyOn(SystemService, 'systemSettingsApiV1SystemSettingsGet').mockResolvedValue({
      success: true,
      data: {
        items: [
          { key: 'trading_mode', value: 'paper', module: 'core', description: 'mode' },
          { key: 'system.mode', value: 'paper', module: 'core', description: 'mode' },
          { key: 'auto_paper_enabled', value: false, module: 'trading', description: 'auto paper' },
          { key: 'risk.maxPositionSize', value: 0.05, module: 'risk', description: 'risk' },
        ],
        meta: { offset: 0, limit: 1000, total: 4 },
      },
    })
    const updateSpy = jest
      .spyOn(SettingsService, 'updateSettingsApiV1SettingsPut')
      .mockResolvedValue({ success: true, data: { key: 'x', value: 'y' } } as never)

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    )
    await clickSettingsTab()

    await userEvent.click(await screen.findByRole('button', { name: 'micro' }))
    await userEvent.click(screen.getByRole('button', { name: 'Проверить и переключить режим' }))

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(2))
    expect(updateSpy).toHaveBeenNthCalledWith(1, {
      requestBody: { key: 'trading_mode', value: 'micro' },
    })
    expect(updateSpy).toHaveBeenNthCalledWith(2, {
      requestBody: { key: 'system.mode', value: 'micro' },
    })
    expect(await screen.findByText('Режим успешно переключен на micro.')).toBeInTheDocument()
  })

  it('updates virtual portfolio capital to 50 000 000', async () => {
    const updateSpy = jest
      .spyOn(SettingsService, 'updateSettingsApiV1SettingsPut')
      .mockResolvedValue({ success: true, data: { key: 'x', value: 'y' } } as never)

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    )
    await clickSettingsTab()

    expect(await screen.findByText('1 000 000')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Установить 50 000 000' }))
    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith({
        requestBody: { key: 'portfolio.virtual.initial_capital', value: 50000000 },
      })
    )
    await waitFor(() => {
      expect(screen.getAllByText('50 000 000').length).toBeGreaterThan(0)
    })
  })
})
