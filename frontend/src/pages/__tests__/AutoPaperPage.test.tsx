import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AutoPaperTradingService } from '@/api/generated/services/AutoPaperTradingService'
import { AutoPaperPage } from '../AutoPaperPage'

describe('AutoPaperPage', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('shows status and stats from API', async () => {
    jest.spyOn(AutoPaperTradingService, 'autoPaperStatusApiV1AutoPaperTradingStatusGet').mockResolvedValue({
      success: true,
      data: { enabled: true, tradingMode: 'paper' },
    } as never)
    jest.spyOn(AutoPaperTradingService, 'autoPaperStatsApiV1AutoPaperTradingStatsGet').mockResolvedValue({
      success: true,
      data: {
        startDate: '2026-03-07',
        endDate: '2026-04-06',
        executedCount: 3,
      },
    } as never)

    render(
      <MemoryRouter initialEntries={['/auto-paper']}>
        <AutoPaperPage />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'Автоторговля' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/Включено: да/)).toBeInTheDocument())
    expect(screen.getByText(/Период учёта:/)).toBeInTheDocument()
    expect(screen.getByText(/Исполнено заявок/)).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('navigates to trading requests', async () => {
    jest.spyOn(AutoPaperTradingService, 'autoPaperStatusApiV1AutoPaperTradingStatusGet').mockResolvedValue({
      success: true,
      data: {},
    } as never)
    jest.spyOn(AutoPaperTradingService, 'autoPaperStatsApiV1AutoPaperTradingStatsGet').mockResolvedValue({
      success: true,
      data: {},
    } as never)

    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/auto-paper']}>
        <Routes>
          <Route path="/auto-paper" element={<AutoPaperPage />} />
          <Route path="/trading-requests" element={<div data-testid="tr-mock">tr</div>} />
        </Routes>
      </MemoryRouter>
    )

    await screen.findByRole('heading', { name: 'Автоторговля' })
    await user.click(screen.getByRole('button', { name: 'К торговым заявкам' }))
    expect(await screen.findByTestId('tr-mock')).toBeInTheDocument()
  })
})
