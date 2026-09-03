import { describe, it, expect } from 'vitest'
import { parseTabParam, buildTabQuery } from './url-tab'

const STAFF = ['structure', 'staff', 'positions'] as const

describe('parseTabParam', () => {
  it('returns the tab when valid', () => {
    expect(parseTabParam('staff', STAFF, 'structure')).toBe('staff')
    expect(parseTabParam('positions', STAFF, 'structure')).toBe('positions')
  })
  it('falls back on missing / empty / unknown', () => {
    expect(parseTabParam(null, STAFF, 'structure')).toBe('structure')
    expect(parseTabParam(undefined, STAFF, 'structure')).toBe('structure')
    expect(parseTabParam('', STAFF, 'structure')).toBe('structure')
    expect(parseTabParam('bogus', STAFF, 'structure')).toBe('structure')
  })
  it('resolves legacy aliases first (?tab=users → staff)', () => {
    expect(parseTabParam('users', STAFF, 'structure', { users: 'staff' })).toBe('staff')
  })
  it('an alias key wins even if it is not in allowed', () => {
    expect(parseTabParam('legacy', ['a', 'b'] as const, 'a', { legacy: 'b' })).toBe('b')
  })
})

describe('buildTabQuery', () => {
  it('sets the key for a non-default tab, preserving other params', () => {
    const base = new URLSearchParams({ q: 'x' })
    expect(buildTabQuery(base, 'tab', 'staff', 'structure')).toBe('q=x&tab=staff')
  })
  it('deletes the key for the default tab (clean landing URL)', () => {
    const base = new URLSearchParams({ tab: 'staff', q: 'x' })
    expect(buildTabQuery(base, 'tab', 'structure', 'structure')).toBe('q=x')
  })
  it('default tab from empty base → empty query', () => {
    expect(buildTabQuery(new URLSearchParams(), 'tab', 'doctor', 'doctor')).toBe('')
  })
  it('round-trips through parseTabParam', () => {
    const qs = buildTabQuery(new URLSearchParams(), 'tab', 'positions', 'structure')
    expect(parseTabParam(new URLSearchParams(qs).get('tab'), STAFF, 'structure')).toBe('positions')
  })
})
