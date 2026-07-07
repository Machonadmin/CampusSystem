import { describe, it, expect } from 'vitest'
import {
  SLA_HOURS,
  PRIORITY_RANK,
  ticketAgeHours,
  isOverdue,
  priorityRank,
  canTransition,
  allowedTransitions,
  statusCounts,
} from './tickets'

// Базовое время подачи и хелпер «через N часов/минут».
const BASE = '2026-07-01T00:00:00.000Z'
function plus(hours: number, minutes = 0): string {
  const ms = new Date(BASE).getTime() + hours * 3_600_000 + minutes * 60_000
  return new Date(ms).toISOString()
}

describe('SLA_HOURS', () => {
  it('has the exact per-priority SLA (hours)', () => {
    expect(SLA_HOURS).toEqual({ urgent: 4, high: 24, normal: 72, low: 168 })
  })
})

describe('ticketAgeHours', () => {
  it('is 0 when now equals reported', () => {
    expect(ticketAgeHours(BASE, BASE)).toBe(0)
  })
  it('counts whole hours', () => {
    expect(ticketAgeHours(BASE, plus(1))).toBe(1)
    expect(ticketAgeHours(BASE, plus(25))).toBe(25)
  })
  it('floors partial hours down', () => {
    expect(ticketAgeHours(BASE, plus(1, 30))).toBe(1)
    expect(ticketAgeHours(BASE, plus(0, 59))).toBe(0)
    expect(ticketAgeHours(BASE, plus(4, 59))).toBe(4)
  })
  it('never returns negative — future reported clamps to 0', () => {
    expect(ticketAgeHours(plus(5), BASE)).toBe(0)
  })
  it('returns 0 for unparseable input rather than NaN', () => {
    expect(ticketAgeHours('not-a-date', BASE)).toBe(0)
  })
})

describe('isOverdue', () => {
  const T = (priority: string, status = 'open') => ({ status, priority, reported_at: BASE })

  it('is NOT overdue exactly at the SLA boundary (strictly greater)', () => {
    expect(isOverdue(T('urgent'), plus(4))).toBe(false)
    expect(isOverdue(T('high'), plus(24))).toBe(false)
    expect(isOverdue(T('normal'), plus(72))).toBe(false)
    expect(isOverdue(T('low'), plus(168))).toBe(false)
  })
  it('is NOT overdue while the age floors to exactly the SLA (4h59m → 4)', () => {
    expect(isOverdue(T('urgent'), plus(4, 59))).toBe(false)
  })
  it('is NOT overdue at the SLA boundary for in_progress either', () => {
    expect(isOverdue(T('urgent', 'in_progress'), plus(4))).toBe(false)
    expect(isOverdue(T('high', 'in_progress'), plus(24))).toBe(false)
  })
  it('is overdue once age exceeds the SLA by a full hour', () => {
    expect(isOverdue(T('urgent'), plus(5))).toBe(true)
    expect(isOverdue(T('high'), plus(25))).toBe(true)
    expect(isOverdue(T('normal'), plus(73))).toBe(true)
    expect(isOverdue(T('low'), plus(169))).toBe(true)
  })
  it('counts both open and in_progress', () => {
    expect(isOverdue(T('urgent', 'open'), plus(5))).toBe(true)
    expect(isOverdue(T('urgent', 'in_progress'), plus(5))).toBe(true)
  })
  it('is never overdue for terminal / resolved statuses regardless of age', () => {
    expect(isOverdue(T('urgent', 'resolved'), plus(1000))).toBe(false)
    expect(isOverdue(T('urgent', 'closed'), plus(1000))).toBe(false)
    expect(isOverdue(T('urgent', 'cancelled'), plus(1000))).toBe(false)
  })
  it('is not overdue for an unknown priority (no SLA)', () => {
    expect(isOverdue(T('whatever'), plus(1000))).toBe(false)
  })
  it('is not overdue for a brand-new open ticket', () => {
    expect(isOverdue(T('urgent'), plus(0, 30))).toBe(false)
  })
})

describe('priorityRank / PRIORITY_RANK', () => {
  it('ranks urgent > high > normal > low', () => {
    expect(PRIORITY_RANK).toEqual({ urgent: 4, high: 3, normal: 2, low: 1 })
    expect(priorityRank('urgent')).toBe(4)
    expect(priorityRank('high')).toBe(3)
    expect(priorityRank('normal')).toBe(2)
    expect(priorityRank('low')).toBe(1)
  })
  it('unknown priority ranks 0 (sorts to the bottom)', () => {
    expect(priorityRank('nope')).toBe(0)
  })
  it('sorts a list correctly by rank desc', () => {
    const sorted = ['low', 'urgent', 'normal', 'high'].sort((a, b) => priorityRank(b) - priorityRank(a))
    expect(sorted).toEqual(['urgent', 'high', 'normal', 'low'])
  })
})

describe('canTransition', () => {
  it('allows open → in_progress | cancelled', () => {
    expect(canTransition('open', 'in_progress')).toBe(true)
    expect(canTransition('open', 'cancelled')).toBe(true)
  })
  it('rejects open → resolved | closed', () => {
    expect(canTransition('open', 'resolved')).toBe(false)
    expect(canTransition('open', 'closed')).toBe(false)
  })
  it('allows in_progress → resolved | cancelled | open (reopen)', () => {
    expect(canTransition('in_progress', 'resolved')).toBe(true)
    expect(canTransition('in_progress', 'cancelled')).toBe(true)
    expect(canTransition('in_progress', 'open')).toBe(true)
  })
  it('rejects in_progress → closed', () => {
    expect(canTransition('in_progress', 'closed')).toBe(false)
  })
  it('allows resolved → closed | in_progress (reopen path)', () => {
    expect(canTransition('resolved', 'closed')).toBe(true)
    expect(canTransition('resolved', 'in_progress')).toBe(true)
  })
  it('rejects resolved → open | cancelled', () => {
    expect(canTransition('resolved', 'open')).toBe(false)
    expect(canTransition('resolved', 'cancelled')).toBe(false)
  })
  it('treats closed and cancelled as terminal (no transitions)', () => {
    for (const to of ['open', 'in_progress', 'resolved', 'closed', 'cancelled']) {
      expect(canTransition('closed', to)).toBe(false)
      expect(canTransition('cancelled', to)).toBe(false)
    }
  })
  it('rejects a no-op transition (from === to)', () => {
    for (const s of ['open', 'in_progress', 'resolved', 'closed', 'cancelled']) {
      expect(canTransition(s, s)).toBe(false)
    }
  })
  it('rejects transitions from an unknown status', () => {
    expect(canTransition('nonsense', 'open')).toBe(false)
  })
})

describe('allowedTransitions', () => {
  it('lists targets for each source status', () => {
    expect(allowedTransitions('open')).toEqual(['in_progress', 'cancelled'])
    expect(allowedTransitions('in_progress')).toEqual(['resolved', 'cancelled', 'open'])
    expect(allowedTransitions('resolved')).toEqual(['closed', 'in_progress'])
    expect(allowedTransitions('closed')).toEqual([])
    expect(allowedTransitions('cancelled')).toEqual([])
  })
  it('returns a copy (mutating it does not corrupt the table)', () => {
    const a = allowedTransitions('open')
    a.push('hacked')
    expect(allowedTransitions('open')).toEqual(['in_progress', 'cancelled'])
  })
  it('returns [] for an unknown status', () => {
    expect(allowedTransitions('nope')).toEqual([])
  })
})

describe('statusCounts', () => {
  it('counts by status', () => {
    const rows = [
      { status: 'open' }, { status: 'open' }, { status: 'in_progress' },
      { status: 'resolved' }, { status: 'open' }, { status: 'closed' },
    ]
    expect(statusCounts(rows)).toEqual({ open: 3, in_progress: 1, resolved: 1, closed: 1 })
  })
  it('is {} for an empty list', () => {
    expect(statusCounts([])).toEqual({})
  })
  it('handles a single row', () => {
    expect(statusCounts([{ status: 'cancelled' }])).toEqual({ cancelled: 1 })
  })
})
