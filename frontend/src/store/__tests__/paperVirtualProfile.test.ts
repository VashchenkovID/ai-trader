import {
  normalizePaperVirtualProfileSlug,
  PAPER_VIRTUAL_PROFILE_SLUGS,
} from '@/store/paperVirtualProfile'

describe('paperVirtualProfile', () => {
  it('normalizes known slugs', () => {
    expect(normalizePaperVirtualProfileSlug('MODERATE')).toBe('moderate')
    expect(normalizePaperVirtualProfileSlug(' aggressive ')).toBe('aggressive')
  })

  it('falls back to moderate for unknown', () => {
    expect(normalizePaperVirtualProfileSlug('nope')).toBe('moderate')
    expect(normalizePaperVirtualProfileSlug('')).toBe('moderate')
  })

  it('slugs list matches backend set', () => {
    expect(PAPER_VIRTUAL_PROFILE_SLUGS).toContain('moderate')
    expect(PAPER_VIRTUAL_PROFILE_SLUGS).toHaveLength(4)
  })
})
