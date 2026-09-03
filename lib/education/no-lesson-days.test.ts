import { describe, it, expect } from 'vitest'
import {
  partitionByNoLessonDays,
  shouldSkipLesson,
  partitionByCalendar,
  mergeDayFlags,
  FULL_OFF_FLAGS,
  type DayTypeFlags,
} from './no-lesson-days'

const FULL_OFF: DayTypeFlags = { blocks_secular: true, blocks_kodesh: true, is_shortened: false }
const NO_KODESH: DayTypeFlags = { blocks_secular: false, blocks_kodesh: true, is_shortened: false }
const KODESH_ONLY: DayTypeFlags = { blocks_secular: true, blocks_kodesh: false, is_shortened: false }
const SHORTENED: DayTypeFlags = { blocks_secular: false, blocks_kodesh: false, is_shortened: true }

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

describe('shouldSkipLesson (per group kind × day type)', () => {
  it('full_off blocks both kinds', () => {
    expect(shouldSkipLesson('kodesh', FULL_OFF)).toBe(true)
    expect(shouldSkipLesson('secular', FULL_OFF)).toBe(true)
  })
  it('no_kodesh blocks only kodesh (secular runs)', () => {
    expect(shouldSkipLesson('kodesh', NO_KODESH)).toBe(true)
    expect(shouldSkipLesson('secular', NO_KODESH)).toBe(false)
  })
  it('kodesh_only blocks only secular (kodesh runs)', () => {
    expect(shouldSkipLesson('kodesh', KODESH_ONLY)).toBe(false)
    expect(shouldSkipLesson('secular', KODESH_ONLY)).toBe(true)
  })
  it('shortened blocks nothing (both kinds generate)', () => {
    expect(shouldSkipLesson('kodesh', SHORTENED)).toBe(false)
    expect(shouldSkipLesson('secular', SHORTENED)).toBe(false)
  })
  it('FULL_OFF_FLAGS export matches full_off semantics', () => {
    expect(FULL_OFF_FLAGS).toEqual(FULL_OFF)
  })
})

describe('partitionByCalendar', () => {
  const cands: Cand[] = [
    { scheduled_date: '2026-09-01' }, // full_off
    { scheduled_date: '2026-09-14' }, // kodesh_only
    { scheduled_date: '2027-03-22' }, // shortened
    { scheduled_date: '2026-09-20' }, // ordinary (not in calendar)
  ]
  const cal = new Map<string, DayTypeFlags>([
    ['2026-09-01', FULL_OFF],
    ['2026-09-14', KODESH_ONLY],
    ['2027-03-22', SHORTENED],
  ])

  it('kodesh group: skips full_off, runs on kodesh_only + shortened + ordinary', () => {
    const { kept, skipped } = partitionByCalendar(cands, cal, 'kodesh')
    expect(skipped).toBe(1)
    expect(kept.map(c => c.scheduled_date).sort()).toEqual(['2026-09-14', '2026-09-20', '2027-03-22'])
  })
  it('secular group: skips full_off + kodesh_only, runs on shortened + ordinary', () => {
    const { kept, skipped } = partitionByCalendar(cands, cal, 'secular')
    expect(skipped).toBe(2)
    expect(kept.map(c => c.scheduled_date).sort()).toEqual(['2026-09-20', '2027-03-22'])
  })
  it('empty calendar keeps everything', () => {
    const { kept, skipped } = partitionByCalendar(cands, new Map(), 'kodesh')
    expect(kept).toHaveLength(4)
    expect(skipped).toBe(0)
  })
})

describe('mergeDayFlags (multiple day types on one date)', () => {
  it('blocks if any blocks; shortened only survives when nothing blocks', () => {
    expect(mergeDayFlags(NO_KODESH, KODESH_ONLY)).toEqual({ blocks_secular: true, blocks_kodesh: true, is_shortened: false })
    expect(mergeDayFlags(SHORTENED, NO_KODESH)).toEqual({ blocks_secular: false, blocks_kodesh: true, is_shortened: false })
    expect(mergeDayFlags(SHORTENED, SHORTENED)).toEqual({ blocks_secular: false, blocks_kodesh: false, is_shortened: true })
  })
})
