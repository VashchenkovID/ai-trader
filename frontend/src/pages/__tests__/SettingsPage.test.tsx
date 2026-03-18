import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SettingsPage } from '../SettingsPage'
import { SystemService } from '@/api/generated/services/SystemService'

const mockSocketState = {
  tasks: [],
  connectionStatus: 'idle',
}

jest.mock('@/store/systemStatusStore', () => ({
  useSystemStatusStore: (selector: (state: typeof mockSocketState) => unknown) => selector(mockSocketState),
}))

describe('SettingsPage', () => {
  beforeEach(() => {
    jest.spyOn(SystemService, 'systemTasksApiV1SystemTasksGet').mockResolvedValue({
      success: true,
      data: { items: [], meta: { limit: 200 } },
    })
    jest.spyOn(SystemService, 'systemSettingsApiV1SystemSettingsGet').mockResolvedValue({
      success: true,
      data: {
        items: [{ key: 'system.mode', value: 'paper', module: 'core', description: 'mode' }],
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
    await waitFor(() => expect(screen.getByText('Вкладка «Настройки» (readonly)')).toBeInTheDocument())
    expect(screen.getByText('system.mode')).toBeInTheDocument()
  })

  it('starts full sync and polls task status', async () => {
    const pollMock = jest
      .spyOn(SystemService, 'systemTaskApiV1SystemTasksTaskIdGet')
      .mockResolvedValueOnce({
        success: true,
        data: { taskId: 'task-1', status: 'completed' },
      })
    jest.spyOn(SystemService, 'systemDataFullSyncYearApiV1SystemDataFullSyncYearPost').mockResolvedValue({
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
})
