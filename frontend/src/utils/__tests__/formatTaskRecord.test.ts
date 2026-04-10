import { formatTaskResultSummary } from '@/utils/formatTaskRecord'

describe('formatTaskResultSummary', () => {
  it('formats timing.durationMs without [object Object]', () => {
    const s = formatTaskResultSummary({
      message: 'done',
      timing: { durationMs: 3500, queuedAt: 'a', startedAt: 'b', finishedAt: 'c' },
    })
    expect(s).toContain('done')
    expect(s).toMatch(/длительность|3\.5 с|3500/)
    expect(s).not.toContain('[object Object]')
  })

  it('formats progress object as compact text', () => {
    const s = formatTaskResultSummary({
      progress: { phase: 'sync', current: 2, total: 10 },
    })
    expect(s).toContain('прогресс')
    expect(s).toContain('sync')
    expect(s).toContain('2/10')
    expect(s).not.toContain('[object Object]')
  })
})
