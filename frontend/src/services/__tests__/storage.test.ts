import {
  clearStoredSession,
  getGuestName,
  getStoredSessionValue,
  getToken,
  removeToken,
  setGuestName,
  setStoredSessionValue,
  setToken,
} from '../storage'

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores and reads token', () => {
    expect(getToken()).toBeNull()
    setToken('abc')
    expect(getToken()).toBe('abc')
    removeToken()
    expect(getToken()).toBeNull()
  })

  it('handles guest name', () => {
    setGuestName('guest1')
    expect(getGuestName()).toBe('guest1')
  })

  it('stores session keys', () => {
    setStoredSessionValue('currentServerId', 'srv')
    expect(getStoredSessionValue('currentServerId')).toBe('srv')
  })

  it('clearStoredSession removes known keys', () => {
    localStorage.setItem('currentServerId', 'x')
    localStorage.setItem('currentDirectId', 'y')
    clearStoredSession()
    expect(localStorage.getItem('currentServerId')).toBeNull()
    expect(localStorage.getItem('currentDirectId')).toBeNull()
  })
})
