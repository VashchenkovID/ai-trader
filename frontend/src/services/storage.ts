export type StoredSessionKey = 'currentServerId' | 'currentRoomId' | 'currentDirectId'

const safeGet = (key: string): string | null => {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const safeSet = (key: string, value: string): void => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore storage errors
  }
}

const safeRemove = (key: string): void => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore storage errors
  }
}

export const getToken = (): string | null => safeGet('token')

export const setToken = (token: string): void => {
  safeSet('token', token)
}

export const removeToken = (): void => {
  safeRemove('token')
}

export const getGuestName = (): string => safeGet('guestName') ?? ''

export const setGuestName = (guestName: string): void => {
  safeSet('guestName', guestName)
}

export const clearStoredSession = (): void => {
  safeRemove('currentServerId')
  safeRemove('currentDirectId')
}

export const getStoredSessionValue = (key: StoredSessionKey): string | null => safeGet(key)

export const setStoredSessionValue = (key: StoredSessionKey, value: string): void => {
  safeSet(key, value)
}
