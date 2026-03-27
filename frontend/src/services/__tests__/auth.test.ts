import { AuthService } from '@/api/generated'
import { loginUser, verifyStoredSession, verifyToken } from '../auth'
import { getToken, setToken } from '../storage'

jest.mock('@/api/generated', () => ({
  AuthService: {
    loginApiV1AuthLoginPost: jest.fn(),
    verifyApiV1AuthVerifyPost: jest.fn(),
    meApiV1AuthMeGet: jest.fn(),
    logoutApiV1AuthLogoutPost: jest.fn(),
  },
}))

describe('auth service', () => {
  beforeEach(() => {
    localStorage.clear()
    jest.clearAllMocks()
  })

  it('loginUser stores token and calls API', async () => {
    jest.mocked(AuthService.loginApiV1AuthLoginPost).mockResolvedValue({
      success: true,
      data: { token: 'tok123' },
    } as never)

    const data = await loginUser('u', 'p')
    expect(data?.token).toBe('tok123')
    expect(getToken()).toBe('tok123')
  })

  it('loginUser throws when no token in response', async () => {
    jest.mocked(AuthService.loginApiV1AuthLoginPost).mockResolvedValue({
      success: true,
      data: {},
    } as never)

    await expect(loginUser('u', 'p')).rejects.toThrow(/токен/)
  })

  it('verifyToken returns false on API error', async () => {
    jest.mocked(AuthService.verifyApiV1AuthVerifyPost).mockRejectedValue(new Error('net'))
    await expect(verifyToken('t')).resolves.toBe(false)
  })

  it('verifyStoredSession returns not ok without token', async () => {
    const s = await verifyStoredSession()
    expect(s.ok).toBe(false)
  })

  it('verifyStoredSession loads user when token valid', async () => {
    setToken('good')
    jest.mocked(AuthService.verifyApiV1AuthVerifyPost).mockResolvedValue({ success: true } as never)
    jest.mocked(AuthService.meApiV1AuthMeGet).mockResolvedValue({
      success: true,
      data: { id: 1, username: 'u', fullName: 'U' },
    } as never)

    const s = await verifyStoredSession()
    expect(s.ok).toBe(true)
    if (s.ok) {
      expect(s.user?.username).toBe('u')
    }
  })
})
