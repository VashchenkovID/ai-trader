import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { MonitoringService } from '@/api/generated/services/MonitoringService'
import { MonitoringAlertsPage } from '../MonitoringAlertsPage'

describe('MonitoringAlertsPage', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders alerts and filters', async () => {
    const listSpy = jest.spyOn(MonitoringService, 'monitoringAlertsApiV1MonitoringAlertsGet').mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 'a1',
            severity: 'warning',
            category: 'cache',
            message: 'Stale',
            createdAt: '2026-01-01T12:00:00Z',
            resolved: false,
          },
        ],
      },
    } as never)

    render(
      <MemoryRouter initialEntries={['/monitoring/alerts']}>
        <MonitoringAlertsPage />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'Алерты мониторинга' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Stale')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Решено' })).toBeInTheDocument()

    await waitFor(() => expect(listSpy).toHaveBeenCalled())
  })

  it('resolves an alert', async () => {
    jest.spyOn(MonitoringService, 'monitoringAlertsApiV1MonitoringAlertsGet').mockResolvedValue({
      success: true,
      data: {
        items: [{ id: 'x1', message: 'm', severity: 'info', category: 'c', createdAt: '2026-01-01', resolved: false }],
      },
    } as never)
    const resolveSpy = jest
      .spyOn(MonitoringService, 'resolveAlertApiV1MonitoringAlertsAlertIdResolvePost')
      .mockResolvedValue({ success: true, data: {} } as never)

    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/monitoring/alerts']}>
        <MonitoringAlertsPage />
      </MemoryRouter>
    )

    await screen.findByText('m')
    await user.click(screen.getByRole('button', { name: 'Решено' }))
    await waitFor(() => expect(resolveSpy).toHaveBeenCalledWith({ alertId: 'x1' }))
  })
})
