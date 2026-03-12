import { AuthService } from '@/api/generated'
import { clearStoredSession, getToken, removeToken, setToken } from './storage'

const withBearer = (token: string) => `Bearer ${token}`

export const loginUser = async (username: string, password: string) => {
  const response = await AuthService.loginApiV1AuthLoginPost({
    requestBody: { username, password },
  })

  const token = response?.data?.token
  if (!token) {
    throw new Error('Не удалось получить токен авторизации')
  }

  setToken(token)
  clearStoredSession()
  return response.data
}

export const verifyToken = async (token: string) => {
  try {
    const response = await AuthService.verifyApiV1AuthVerifyPost({
      requestBody: { token },
    })

    return Boolean(response?.success ?? true)
  } catch {
    return false
  }
}

export const fetchCurrentUser = async (token: string) => {
  const response = await AuthService.meApiV1AuthMeGet({
    authorization: withBearer(token),
  })

  return response.data
}

export const verifyStoredSession = async () => {
  const token = getToken()
  if (!token) {
    return { ok: false as const, token: null, user: null }
  }

  const tokenValid = await verifyToken(token)
  if (!tokenValid) {
    removeToken()
    return { ok: false as const, token: null, user: null }
  }

  try {
    const user = await fetchCurrentUser(token)
    return { ok: true as const, token, user }
  } catch {
    removeToken()
    return { ok: false as const, token: null, user: null }
  }
}

export const logoutUser = async () => {
  const token = getToken()
  try {
    if (token) {
      await AuthService.logoutApiV1AuthLogoutPost({
        authorization: withBearer(token),
      })
    }
  } finally {
    removeToken()
    clearStoredSession()
  }
}
