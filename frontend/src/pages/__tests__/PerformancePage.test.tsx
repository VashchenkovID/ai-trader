import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { PerformanceService } from '@/api/generated/services/PerformanceService'
import { ProfitabilityService } from '@/api/generated/services/ProfitabilityService'
import { PerformancePage } from '../PerformancePage'

describe('PerformancePage', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('loads dashboard, sectors and profitability blocks', async () => {
    jest.spyOn(PerformanceService, 'performanceDashboardApiV1PerformanceVisualizationDashboardGet').mockResolvedValue({
      success: true,
      data: { period: 30, summary: 'ok' },
    } as never)
    jest.spyOn(PerformanceService, 'performanceSectorAnalysisApiV1PerformanceSectorAnalysisGet').mockResolvedValue({
      success: true,
      data: { sectors: [] },
    } as never)
    jest.spyOn(ProfitabilityService, 'profitabilityReportApiV1ProfitabilityReportGet').mockResolvedValue({
      success: true,
      data: { total: 1 },
    } as never)
    jest.spyOn(ProfitabilityService, 'profitabilityAnalysisApiV1ProfitabilityAnalysisGet').mockResolvedValue({
      success: true,
      data: { rows: [] },
    } as never)

    render(
      <MemoryRouter initialEntries={['/performance']}>
        <PerformancePage />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'Производительность и PnL' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/Дашборд производительности/)).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Сектора' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Отчёт прибыльности' })).toBeInTheDocument()
  })

  it('reloads when user clicks load', async () => {
    const dashSpy = jest
      .spyOn(PerformanceService, 'performanceDashboardApiV1PerformanceVisualizationDashboardGet')
      .mockResolvedValue({ success: true, data: {} } as never)
    jest.spyOn(PerformanceService, 'performanceSectorAnalysisApiV1PerformanceSectorAnalysisGet').mockResolvedValue({
      success: true,
      data: {},
    } as never)
    jest.spyOn(ProfitabilityService, 'profitabilityReportApiV1ProfitabilityReportGet').mockResolvedValue({
      success: true,
      data: {},
    } as never)
    jest.spyOn(ProfitabilityService, 'profitabilityAnalysisApiV1ProfitabilityAnalysisGet').mockResolvedValue({
      success: true,
      data: {},
    } as never)

    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/performance']}>
        <PerformancePage />
      </MemoryRouter>
    )

    await screen.findByRole('heading', { name: 'Производительность и PnL' })
    const first = dashSpy.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Загрузить' }))
    await waitFor(() => expect(dashSpy.mock.calls.length).toBeGreaterThan(first))
  })
})
