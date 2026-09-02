import { describe, it, expect } from 'vitest'
import { partitionByNoLessonDays } from './no-lesson-days'

interface Cand { scheduled_date: string; scheduled_time?: string }

describe('partitionByNoLessonDays', () => {
  const cands: Cand[] = [
    { scheduled_date: '2026-09-01' },
    { scheduled_date: '2026-09-02' },
    { scheduled_date: '2026-09-03' },
    { scheduled_date: '2026-09-02' }, // second slot same day
  ]

  it('keeps all when the no-lesson set is empty', () => {
    const { kept, skipped } = partitionByNoLessonDays(cands, new Set())
    expect(kept).toHaveLength(4)
    expect(skipped).toBe(0)
  })

  it('drops every candidate that falls on a no-lesson date (all slots that day)', () => {
    const { kept, skipped } = partitionByNoLessonDays(cands, new Set(['2026-09-02']))
    expect(skipped).toBe(2)
    expect(kept.map(c => c.scheduled_date)).toEqual(['2026-09-01', '2026-09-03'])
  })

  it('drops multiple distinct no-lesson dates', () => {
    const { kept, skipped } = partitionByNoLessonDays(cands, new Set(['2026-09-01', '2026-09-03']))
    expect(skipped).toBe(2)
    expect(kept.map(c => c.scheduled_date)).toEqual(['2026-09-02', '2026-09-02'])
  })

  it('is a no-op when no candidate matches the set', () => {
    const { kept, skipped } = partitionByNoLessonDays(cands, new Set(['2030-01-01']))
    expect(kept).toHaveLength(4)
    expect(skipped).toBe(0)
  })

  it('handles an empty candidate list', () => {
    const { kept, skipped } = partitionByNoLessonDays([] as Cand[], new Set(['2026-09-02']))
    expect(kept).toEqual([])
    expect(skipped).toBe(0)
  })
})
