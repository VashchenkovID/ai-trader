import { RequestStatusEnum } from '../constants'

describe('RequestStatusEnum', () => {
  it('has stable values', () => {
    expect(RequestStatusEnum.FULFILLED).toBe('FULFILLED')
    expect(RequestStatusEnum.REJECTED).toBe('REJECTED')
  })
})
