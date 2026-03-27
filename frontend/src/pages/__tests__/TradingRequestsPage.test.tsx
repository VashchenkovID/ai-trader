import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { TradingRequestsService } from '@/api/generated/services/TradingRequestsService'
import { TradingRequestsPage } from '../TradingRequestsPage'

describe('TradingRequestsPage', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders stats and requests list from API', async () => {
    jest.spyOn(TradingRequestsService, 'tradingRequestsListApiV1TradingRequestsGet').mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            requestId: 'req-1',
            ticker: 'SBER',
            figi: 'BBG004730N88',
            action: 'BUY',
            quantity: 10,
            price: 100,
            budget: 1000,
            status: 'PENDING',
            mode: 'paper',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
          {
            requestId: 'req-2',
            ticker: 'GAZP',
            figi: 'F2',
            action: 'SELL',
            quantity: 5,
            price: 200,
            amount: 1000,
            status: 'EXECUTED',
            mode: 'paper',
            createdAt: '2026-01-02T12:03:04Z',
            updatedAt: '2026-01-02T12:03:04Z',
          },
        ],
        meta: { total: 2 },
      },
    } as never)
    jest.spyOn(TradingRequestsService, 'tradingRequestsStatsApiV1TradingRequestsStatsGet').mockResolvedValue({
      success: true,
      data: { byStatus: { PENDING: 1, EXECUTED: 1 }, total: 2 },
    } as never)

    render(
      <MemoryRouter initialEntries={['/trading-requests']}>
        <TradingRequestsPage />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'Торговые заявки' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('SBER (BBG004730N88)')).toBeInTheDocument())
    expect(screen.getByText('Ожидают')).toBeInTheDocument()
    expect(screen.getByText('Исполнены')).toBeInTheDocument()
    expect(screen.getAllByText('Сумма: 1000').length).toBeGreaterThan(0)
    expect(screen.getByText(/Создана: 01\.01\.2026/)).toBeInTheDocument()
  })

  it('applies status filter and passes it to API', async () => {
    const listSpy = jest
      .spyOn(TradingRequestsService, 'tradingRequestsListApiV1TradingRequestsGet')
      .mockResolvedValue({
        success: true,
        data: { items: [], meta: { total: 0 } },
      } as never)
    jest.spyOn(TradingRequestsService, 'tradingRequestsStatsApiV1TradingRequestsStatsGet').mockResolvedValue({
      success: true,
      data: { pending: 0, approved: 0, executed: 0, rejected: 0, canceled: 0, total: 0 },
    } as never)

    render(
      <MemoryRouter initialEntries={['/trading-requests']}>
        <TradingRequestsPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(listSpy).toHaveBeenCalled())
    await userEvent.selectOptions(screen.getAllByLabelText('Статус')[0], 'APPROVED')
    await waitFor(() =>
      expect(listSpy).toHaveBeenLastCalledWith({
        status: 'APPROVED',
        mode: null,
        offset: 0,
        limit: 20,
      })
    )
  })

  it('opens approve dialog and sends approve mutation', async () => {
    const listSpy = jest
      .spyOn(TradingRequestsService, 'tradingRequestsListApiV1TradingRequestsGet')
      .mockResolvedValue({
        success: true,
        data: {
          items: [
            {
              requestId: 'req-2',
              ticker: 'GAZP',
              figi: 'F2',
              action: 'BUY',
              status: 'PENDING',
              mode: 'paper',
            },
          ],
          meta: { total: 1 },
        },
      } as never)
    jest.spyOn(TradingRequestsService, 'tradingRequestsStatsApiV1TradingRequestsStatsGet').mockResolvedValue({
      success: true,
      data: { pending: 1, approved: 0, executed: 0, rejected: 0, canceled: 0, total: 1 },
    } as never)
    const approveSpy = jest
      .spyOn(TradingRequestsService, 'tradingRequestApproveApiV1TradingRequestsRequestIdApprovePost')
      .mockResolvedValue({ success: true, data: {} } as never)

    render(
      <MemoryRouter initialEntries={['/trading-requests']}>
        <TradingRequestsPage />
      </MemoryRouter>
    )

    await screen.findByText('GAZP (F2)')
    await userEvent.click(screen.getByRole('button', { name: 'Одобрить' }))
    expect(await screen.findByRole('heading', { name: 'Подтвердить одобрение заявки' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Комментарий (опционально)'), 'ok')
    await userEvent.click(screen.getAllByRole('button', { name: 'Одобрить' })[1])

    await waitFor(() =>
      expect(approveSpy).toHaveBeenCalledWith({
        requestId: 'req-2',
        requestBody: { comment: 'ok' },
      })
    )
    expect(listSpy).toHaveBeenCalledTimes(2)
  })

  it('calculates stats and amount on frontend when stats payload is empty', async () => {
    jest.spyOn(TradingRequestsService, 'tradingRequestsListApiV1TradingRequestsGet').mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            requestId: 'req-a',
            ticker: 'SBER',
            figi: 'A',
            action: 'BUY',
            quantity: 3,
            price: 150,
            status: 'PENDING',
            mode: 'paper',
          },
          {
            requestId: 'req-b',
            ticker: 'LKOH',
            figi: 'B',
            action: 'SELL',
            quantity: 2,
            price: 500,
            status: 'APPROVED',
            mode: 'paper',
          },
        ],
        meta: { total: 2 },
      },
    } as never)
    jest.spyOn(TradingRequestsService, 'tradingRequestsStatsApiV1TradingRequestsStatsGet').mockResolvedValue({
      success: true,
      data: {},
    } as never)

    render(
      <MemoryRouter initialEntries={['/trading-requests']}>
        <TradingRequestsPage />
      </MemoryRouter>
    )

    await screen.findByText('SBER (A)')
    expect(screen.getByText('Ожидают')).toBeInTheDocument()
    expect(screen.getByText('Одобрены')).toBeInTheDocument()
    expect(screen.getByText('Сумма: 450')).toBeInTheDocument()
    expect(screen.getByText('Сумма: 1000')).toBeInTheDocument()
  })
})

