import { describe, it, expect } from 'vitest'
import {
  SEVERITY_RANK,
  severityRank,
  canTransition,
  allowedTransitions,
  incidentStats,
} from './incidents'

describe('SEVERITY_RANK / severityRank', () => {
  it('ranks critical > high > medium > low', () => {
    expect(SEVERITY_RANK).toEqual({ critical: 4, high: 3, medium: 2, low: 1 })
    expect(severityRank('critical')).toBe(4)
    expect(severityRank('high')).toBe(3)
    expect(severityRank('medium')).toBe(2)
    expect(severityRank('low')).toBe(1)
  })
  it('unknown severity ranks 0 (sorts to the bottom)', () => {
    expect(severityRank('nope')).toBe(0)
    expect(severityRank('')).toBe(0)
  })
  it('sorts a list correctly by rank desc', () => {
    const sorted = ['low', 'critical', 'medium', 'high'].sort((a, b) => severityRank(b) - severityRank(a))
    expect(sorted).toEqual(['critical', 'high', 'medium', 'low'])
  })
})

describe('canTransition', () => {
  it('allows open → investigating | closed', () => {
    expect(canTransition('open', 'investigating')).toBe(true)
    expect(canTransition('open', 'closed')).toBe(true)
  })
  it('rejects open → resolved', () => {
    expect(canTransition('open', 'resolved')).toBe(false)
  })
  it('allows investigating → resolved | closed', () => {
    expect(canTransition('investigating', 'resolved')).toBe(true)
    expect(canTransition('investigating', 'closed')).toBe(true)
  })
  it('rejects investigating → open', () => {
    expect(canTransition('investigating', 'open')).toBe(false)
  })
  it('allows resolved → closed | investigating (reopen path)', () => {
    expect(canTransition('resolved', 'closed')).toBe(true)
    expect(canTransition('resolved', 'investigating')).toBe(true)
  })
  it('rejects resolved → open', () => {
    expect(canTransition('resolved', 'open')).toBe(false)
  })
  it('treats closed as terminal (no transitions)', () => {
    for (const to of ['open', 'investigating', 'resolved', 'closed']) {
      expect(canTransition('closed', to)).toBe(false)
    }
  })
  it('rejects a no-op transition (from === to)', () => {
    for (const s of ['open', 'investigating', 'resolved', 'closed']) {
      expect(canTransition(s, s)).toBe(false)
    }
  })
  it('rejects transitions from an unknown status', () => {
    expect(canTransition('nonsense', 'open')).toBe(false)
    expect(canTransition('', 'open')).toBe(false)
  })
})

describe('allowedTransitions', () => {
  it('lists targets for each source status', () => {
    expect(allowedTransitions('open')).toEqual(['investigating', 'closed'])
    expect(allowedTransitions('investigating')).toEqual(['resolved', 'closed'])
    expect(allowedTransitions('resolved')).toEqual(['closed', 'investigating'])
    expect(allowedTransitions('closed')).toEqual([])
  })
  it('returns a copy (mutating it does not corrupt the table)', () => {
    const a = allowedTransitions('open')
    a.push('hacked')
    expect(allowedTransitions('open')).toEqual(['investigating', 'closed'])
  })
  it('returns [] for an unknown status', () => {
    expect(allowedTransitions('nope')).toEqual([])
  })
})

describe('incidentStats', () => {
  it('counts by status, computes active and by_severity', () => {
    const rows = [
      { status: 'open', severity: 'critical' },
      { status: 'open', severity: 'low' },
      { status: 'investigating', severity: 'high' },
      { status: 'resolved', severity: 'medium' },
      { status: 'closed', severity: 'low' },
      { status: 'closed', severity: 'critical' },
    ]
    expect(incidentStats(rows)).toEqual({
      total: 6,
      open: 2,
      investigating: 1,
      resolved: 1,
      closed: 2,
      active: 3, // open (2) + investigating (1)
      by_severity: { critical: 2, low: 2, high: 1, medium: 1 },
    })
  })
  it('is all-zero for an empty list', () => {
    expect(incidentStats([])).toEqual({
      total: 0, open: 0, investigating: 0, resolved: 0, closed: 0, active: 0, by_severity: {},
    })
  })
  it('handles a single active incident', () => {
    expect(incidentStats([{ status: 'open', severity: 'medium' }])).toEqual({
      total: 1, open: 1, investigating: 0, resolved: 0, closed: 0, active: 1,
      by_severity: { medium: 1 },
    })
  })
  it('counts every severity', () => {
    const rows = [
      { status: 'open', severity: 'low' },
      { status: 'open', severity: 'medium' },
      { status: 'open', severity: 'high' },
      { status: 'open', severity: 'critical' },
    ]
    const s = incidentStats(rows)
    expect(s.by_severity).toEqual({ low: 1, medium: 1, high: 1, critical: 1 })
    expect(s.active).toBe(4)
  })
  it('active is 0 when nothing is open/investigating', () => {
    const rows = [
      { status: 'resolved', severity: 'high' },
      { status: 'closed', severity: 'low' },
    ]
    const s = incidentStats(rows)
    expect(s.active).toBe(0)
    expect(s.resolved).toBe(1)
    expect(s.closed).toBe(1)
  })
})
