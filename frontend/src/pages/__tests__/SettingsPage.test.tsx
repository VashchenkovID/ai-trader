import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SettingsPage } from '../SettingsPage'
import { AutoPaperTradingService } from '@/api/generated/services/AutoPaperTradingService'
import { SystemService } from '@/api/generated/services/SystemService'

const mockSocketState = {
  tasks: [],
  connectionStatus: 'idle',
}

jest.mock('@/store/systemStatusStore', () => ({
  useSystemStatusStore: (selector: (state: typeof mockSocketState) => unknown) =>
    selector(mockSocketState),
}))

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
        ],
        meta: { offset: 0, limit: 1000, total: 1 },
      },
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders tabs and readonly settings', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    )

    expect(screen.getByText('Вкладка «Данные»')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Настройки' }))
    await waitFor(() =>
      expect(screen.getByText('Вкладка «Настройки» (readonly)')).toBeInTheDocument()
    )
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

    const buttons = screen.getAllByRole('button', { name: 'Запустить' })
    await userEvent.click(buttons[0])
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
    let resolvePost: (value: unknown) => void = () => {}
    const postPromise = new Promise(resolve => {
      resolvePost = resolve
    })
    jest
      .spyOn(SystemService, 'systemTrainingQuickApiV1SystemTrainingQuickPost')
      .mockImplementation(() => postPromise as Promise<{ data: Record<string, unknown> }>)
    jest.spyOn(SystemService, 'systemTaskApiV1SystemTasksTaskIdGet').mockResolvedValue({
      success: true,
      data: { taskId: 'new-task', status: 'completed' },
    })

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsPage />
      </MemoryRouter>
    )

    const buttons = screen.getAllByRole('button', { name: 'Запустить' })
    await userEvent.click(buttons[2])

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
    await userEvent.click(screen.getByRole('button', { name: 'Настройки' }))
    const toggle = await screen.findByRole('switch', { name: /Включено/i })
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

    const buttons = screen.getAllByRole('button', { name: 'Запустить' })
    await userEvent.click(buttons[4])
    await waitFor(() => expect(screen.getByText(/taskId: deg-1/)).toBeInTheDocument())
    await waitFor(() => expect(pollMock).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('Завершено')).toBeInTheDocument())
  })
})
