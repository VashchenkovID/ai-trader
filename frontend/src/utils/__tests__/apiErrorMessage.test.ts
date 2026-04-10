import { apiErrorMessage } from '@/utils/apiErrorMessage'

describe('apiErrorMessage', () => {
  it('reads nested error.message from ApiError-like body', () => {
    const err = { body: { error: { message: 'Недостаточно прав' } } }
    expect(apiErrorMessage(err)).toBe('Недостаточно прав')
  })

  it('falls back to Error.message', () => {
    expect(apiErrorMessage(new Error('fail'))).toBe('fail')
  })

  it('returns default for unknown', () => {
    expect(apiErrorMessage(null)).toBe('Ошибка запроса')
  })
})
