import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TinkoffService } from '@/api/generated/services/TinkoffService'
import { TinkoffPage } from '../TinkoffPage'

describe('TinkoffPage', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('loads user info and accounts', async () => {
    jest.spyOn(TinkoffService, 'userInfoApiV1TinkoffUserInfoGet').mockResolvedValue({
      success: true,
      data: { name: 'Investor' },
    } as never)
    jest.spyOn(TinkoffService, 'accountsApiV1TinkoffAccountsGet').mockResolvedValue({
      success: true,
      data: { items: [{ id: 'a1' }] },
    } as never)

    render(
      <MemoryRouter initialEntries={['/tinkoff']}>
        <TinkoffPage />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'Tinkoff Invest' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/Investor/)).toBeInTheDocument())
    expect(screen.getByText(/items/)).toBeInTheDocument()
  })

  it('navigates to portfolio', async () => {
    jest.spyOn(TinkoffService, 'userInfoApiV1TinkoffUserInfoGet').mockResolvedValue({
      success: true,
      data: {},
    } as never)
    jest.spyOn(TinkoffService, 'accountsApiV1TinkoffAccountsGet').mockResolvedValue({
      success: true,
      data: {},
    } as never)

    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/tinkoff']}>
        <Routes>
          <Route path="/tinkoff" element={<TinkoffPage />} />
          <Route path="/portfolio" element={<div data-testid="pf">pf</div>} />
        </Routes>
      </MemoryRouter>
    )

    await screen.findByRole('heading', { name: 'Tinkoff Invest' })
    await user.click(screen.getByRole('button', { name: 'Открыть портфель' }))
    expect(await screen.findByTestId('pf')).toBeInTheDocument()
  })
})
