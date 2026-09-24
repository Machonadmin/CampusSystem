import { describe, it, expect } from 'vitest'
import { aggregateAbsenceCounts, type AttRow } from './absence-counts'
import type { KodeshExemptions } from './kodesh-exceptions'

/**
 * Юнит-тесты чистой агрегации пропусков. Проверяем подсчёт absent/late по
 * journey и вычитание освобождённых пропусков кодеша (חריגות קודש).
 */

const lessonInfo = new Map<string, { gid: string; date: string }>([
  ['L1', { gid: 'G_REG', date: '2026-08-01' }], // обычная группа
  ['L2', { gid: 'G_REG', date: '2026-08-02' }],
  ['L3', { gid: 'G_KODESH', date: '2026-08-03' }], // кодеш
  ['L4', { gid: 'G_KODESH', date: '2026-08-04' }],
])
const kodeshGroupIds = new Set(['G_KODESH'])

function exemptFor(pairs: Array<[string, string]>): KodeshExemptions {
  const set = new Set(pairs.map(([j, d]) => `${j}|${d}`))
  return { hasAny: set.size > 0, isExempt: (j, d) => set.has(`${j}|${d}`) }
}

describe('aggregateAbsenceCounts', () => {
  it('counts absent and late per journey', () => {
    const rows: AttRow[] = [
      { lesson_id: 'L1', journey_id: 'J1', status: 'absent' },
      { lesson_id: 'L2', journey_id: 'J1', status: 'late' },
      { lesson_id: 'L1', journey_id: 'J2', status: 'absent' },
      { lesson_id: 'L2', journey_id: 'J2', status: 'absent' },
    ]
    const out = aggregateAbsenceCounts({ attRows: rows, lessonInfo, kodeshGroupIds, exemptions: null })
    expect(out.get('J1')).toEqual({ absent: 1, late: 1 })
    expect(out.get('J2')).toEqual({ absent: 2, late: 0 })
  })

  it('ignores rows without journey_id', () => {
    const rows: AttRow[] = [{ lesson_id: 'L1', journey_id: null, status: 'absent' }]
    const out = aggregateAbsenceCounts({ attRows: rows, lessonInfo, kodeshGroupIds, exemptions: null })
    expect(out.size).toBe(0)
  })

  it('ignores statuses other than absent/late', () => {
    const rows: AttRow[] = [
      { lesson_id: 'L1', journey_id: 'J1', status: 'present' },
      { lesson_id: 'L2', journey_id: 'J1', status: null },
    ]
    const out = aggregateAbsenceCounts({ attRows: rows, lessonInfo, kodeshGroupIds, exemptions: null })
    expect(out.size).toBe(0)
  })

  it('excludes an exempt kodesh absence but keeps a regular one', () => {
    const rows: AttRow[] = [
      { lesson_id: 'L1', journey_id: 'J1', status: 'absent' }, // обычный — считается
      { lesson_id: 'L3', journey_id: 'J1', status: 'absent' }, // кодеш, освобождена — НЕ считается
    ]
    const out = aggregateAbsenceCounts({
      attRows: rows, lessonInfo, kodeshGroupIds,
      exemptions: exemptFor([['J1', '2026-08-03']]),
    })
    expect(out.get('J1')).toEqual({ absent: 1, late: 0 })
  })

  it('counts a kodesh absence when the student is NOT exempt that day', () => {
    const rows: AttRow[] = [
      { lesson_id: 'L3', journey_id: 'J1', status: 'absent' },
      { lesson_id: 'L4', journey_id: 'J1', status: 'absent' },
    ]
    const out = aggregateAbsenceCounts({
      attRows: rows, lessonInfo, kodeshGroupIds,
      exemptions: exemptFor([['J1', '2026-08-03']]), // освобождена только 08-03
    })
    // L3 (08-03) освобождён → не считается; L4 (08-04) считается.
    expect(out.get('J1')).toEqual({ absent: 1, late: 0 })
  })

  it('does not apply exemptions to non-kodesh groups', () => {
    const rows: AttRow[] = [{ lesson_id: 'L1', journey_id: 'J1', status: 'absent' }]
    // Даже если бы студентка была «освобождена» на эту дату, L1 — обычная группа.
    const out = aggregateAbsenceCounts({
      attRows: rows, lessonInfo, kodeshGroupIds,
      exemptions: exemptFor([['J1', '2026-08-01']]),
    })
    expect(out.get('J1')).toEqual({ absent: 1, late: 0 })
  })
})
