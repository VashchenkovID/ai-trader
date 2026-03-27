import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DashboardSystemStatus } from '../components/DashboardSystemStatus'

describe('DashboardSystemStatus', () => {
  it('renders fields and calls refresh', async () => {
    const onRefresh = jest.fn()
    const user = userEvent.setup()

    render(
      <DashboardSystemStatus
        username="trader"
        modeText="paper"
        portfolioKind="virtual"
        connectionStatus="connected"
        taskFailedCount={1}
        schedulerCount={2}
        lastEventAt="2026-01-01T10:00:00Z"
        lastPortfolioUpdatedAt="2026-01-01T11:00:00Z"
        isRefreshBusy={false}
        onRefresh={onRefresh}
      />
    )

    expect(screen.getByText('Состояние системы')).toBeInTheDocument()
    expect(screen.getByText('trader')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Обновить данные' }))
    expect(onRefresh).toHaveBeenCalled()
  })

  it('shows dashes for missing user and portfolio kind', () => {
    render(
      <DashboardSystemStatus
        username={null}
        modeText="paper"
        portfolioKind={null}
        connectionStatus="idle"
        taskFailedCount={0}
        schedulerCount={0}
        lastEventAt={null}
        lastPortfolioUpdatedAt={null}
        isRefreshBusy={false}
        onRefresh={() => {}}
      />
    )
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
