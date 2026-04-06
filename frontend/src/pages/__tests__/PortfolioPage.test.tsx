import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { PortfolioService } from '@/api/generated/services/PortfolioService'
import { PortfolioPage } from '../PortfolioPage'

describe('PortfolioPage', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('loads portfolio summary and positions', async () => {
    jest.spyOn(PortfolioService, 'getVirtualPortfolioApiV1PortfolioVirtualGet').mockResolvedValue({
      success: true,
      data: {
        cash: 1_000_000,
        totalValue: 1_000_000,
        positionsValue: 0,
        positions: {},
        positionsList: [],
        isVirtual: true,
      },
    } as never)
    jest.spyOn(PortfolioService, 'getPortfolioApiV1PortfolioGet').mockResolvedValue({
      success: true,
      data: {
        cash: 100_000,
        totalValue: 500_000,
        positionsValue: 400_000,
        positions: [
          { figi: 'BBG1', ticker: 'SBER', quantity: 10, currentPrice: 250, averagePositionPrice: 240 },
        ],
      },
    } as never)
    jest.spyOn(PortfolioService, 'portfolioSyncStatusApiV1PortfolioSyncStatusGet').mockResolvedValue({
      success: true,
      data: { lastOk: true },
    } as never)
    jest
      .spyOn(PortfolioService, 'getPortfolioPositionRecommendationsApiV1PortfolioPositionRecommendationsGet')
      .mockResolvedValue({
        success: true,
        data: {
          items: [{ figi: 'BBG1', recommendation: 'HOLD', confidence: 0.7 }],
          meta: { requested: 1, returned: 1 },
        },
      } as never)

    render(
      <MemoryRouter initialEntries={['/portfolio']}>
        <PortfolioPage />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'Портфель' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/Кэш:/)).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Реальный' }))
    const table = screen.getByRole('table')
    expect(within(table).getByText(/SBER/)).toBeInTheDocument()
    expect(within(table).getByText('BBG1')).toBeInTheDocument()
    expect(within(table).getByText('Держать')).toBeInTheDocument()
  })

  it('triggers sync and reloads', async () => {
    jest.spyOn(PortfolioService, 'getVirtualPortfolioApiV1PortfolioVirtualGet').mockResolvedValue({
      success: true,
      data: { cash: 1, totalValue: 1, positionsValue: 0, positions: {}, positionsList: [], isVirtual: true },
    } as never)
    const getSpy = jest.spyOn(PortfolioService, 'getPortfolioApiV1PortfolioGet').mockResolvedValue({
      success: true,
      data: { cash: 0, positions: [] },
    } as never)
    jest.spyOn(PortfolioService, 'portfolioSyncStatusApiV1PortfolioSyncStatusGet').mockResolvedValue({
      success: true,
      data: {},
    } as never)
    jest
      .spyOn(PortfolioService, 'getPortfolioPositionRecommendationsApiV1PortfolioPositionRecommendationsGet')
      .mockResolvedValue({ success: true, data: { items: [], meta: {} } } as never)
    const syncSpy = jest
      .spyOn(PortfolioService, 'realPortfolioSyncTriggerApiV1PortfolioRealSyncPost')
      .mockResolvedValue({ success: true, data: {} } as never)

    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/portfolio']}>
        <PortfolioPage />
      </MemoryRouter>
    )

    await screen.findByRole('heading', { name: 'Портфель' })
    await user.click(screen.getByRole('button', { name: 'Реальный' }))
    await user.click(screen.getByRole('button', { name: 'Синхронизировать с брокером' }))
    await waitFor(() => expect(syncSpy).toHaveBeenCalled())
    expect(getSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
