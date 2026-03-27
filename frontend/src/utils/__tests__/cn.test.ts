import { cn } from '../cn'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('ignores falsy values', () => {
    expect(cn('a', false, 'b', null, undefined)).toBe('a b')
  })
})
