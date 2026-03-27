import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LoginPage } from '../LoginPage'
import * as auth from '@/services/auth'

jest.mock('@/services/auth', () => ({
  verifyStoredSession: jest.fn(),
  loginUser: jest.fn(),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    jest.mocked(auth.verifyStoredSession).mockResolvedValue({
      ok: false,
      token: null,
      user: null,
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('shows login form when session is absent', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByLabelText('Логин')).toBeInTheDocument()
    expect(screen.getByLabelText('Пароль')).toBeInTheDocument()
  })

  it('redirects to dashboard when session already valid', async () => {
    jest.mocked(auth.verifyStoredSession).mockResolvedValue({
      ok: true,
      token: 't',
      user: { id: 1, username: 'u', fullName: 'User' },
    })

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div data-testid="dashboard-mock">ok</div>} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByTestId('dashboard-mock')).toBeInTheDocument()
  })

  it('validates empty submit', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    )

    await screen.findByLabelText('Логин')
    await user.click(screen.getByRole('button', { name: 'Войти' }))
    expect(await screen.findByText('Укажите логин и пароль')).toBeInTheDocument()
  })

  it('submits credentials and navigates on success', async () => {
    jest.mocked(auth.loginUser).mockResolvedValue({ token: 'x' } as never)
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div data-testid="dashboard-mock">ok</div>} />
        </Routes>
      </MemoryRouter>
    )

    await screen.findByLabelText('Логин')
    await user.type(screen.getByLabelText('Логин'), 'trader')
    await user.type(screen.getByLabelText('Пароль'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    await waitFor(() => expect(auth.loginUser).toHaveBeenCalledWith('trader', 'secret'))
    expect(await screen.findByTestId('dashboard-mock')).toBeInTheDocument()
  })

  it('shows error on failed login', async () => {
    jest.mocked(auth.loginUser).mockRejectedValue(new Error('bad'))
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    )

    await screen.findByLabelText('Логин')
    await user.type(screen.getByLabelText('Логин'), 'trader')
    await user.type(screen.getByLabelText('Пароль'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByText('Неверный логин или пароль')).toBeInTheDocument()
  })
})
