import { describe, it, expect } from 'vitest'
import {
  parseStudySection,
  parseStudiesNav,
  applyStudiesNav,
  type StudiesNav,
} from './studies-nav'

const fromParams = (obj: Record<string, string>) => {
  const p = new URLSearchParams(obj)
  return (k: string) => p.get(k)
}

describe('parseStudySection', () => {
  it('returns a known section', () => {
    expect(parseStudySection('semester_groups')).toBe('semester_groups')
    expect(parseStudySection('students')).toBe('students')
  })
  it('defaults to dashboard for missing/unknown', () => {
    expect(parseStudySection(null)).toBe('dashboard')
    expect(parseStudySection(undefined)).toBe('dashboard')
    expect(parseStudySection('')).toBe('dashboard')
    expect(parseStudySection('bogus')).toBe('dashboard')
  })
})

describe('parseStudiesNav', () => {
  it('empty params → everything null', () => {
    expect(parseStudiesNav(fromParams({}))).toEqual({ structId: null, yearLevel: null, cohort: null, sem: null })
  })
  it('full chol drill', () => {
    expect(parseStudiesNav(fromParams({ struct: 't1', ylevel: '2', cohort: 'תשפ״ז', sem: 's9' }))).toEqual({
      structId: 't1', yearLevel: 2, cohort: 'תשפ״ז', sem: 's9',
    })
  })
  it("keeps the 'none' sentinels for year and cohort", () => {
    expect(parseStudiesNav(fromParams({ struct: '__none__', ylevel: 'none', cohort: 'none' }))).toEqual({
      structId: '__none__', yearLevel: 'none', cohort: 'none', sem: null,
    })
  })
  it('sem is independent (kodesh level opened from the top level, no struct)', () => {
    expect(parseStudiesNav(fromParams({ sem: 'lvlA' }))).toEqual({
      structId: null, yearLevel: null, cohort: null, sem: 'lvlA',
    })
  })
  it('normalizes hierarchy: ylevel without struct is dropped', () => {
    expect(parseStudiesNav(fromParams({ ylevel: '2', cohort: 'x' }))).toEqual({
      structId: null, yearLevel: null, cohort: null, sem: null,
    })
  })
  it('normalizes hierarchy: cohort without ylevel is dropped', () => {
    expect(parseStudiesNav(fromParams({ struct: 't1', cohort: 'x' }))).toEqual({
      structId: 't1', yearLevel: null, cohort: null, sem: null,
    })
  })
  it('rejects a non-positive / non-integer ylevel', () => {
    expect(parseStudiesNav(fromParams({ struct: 't1', ylevel: '0' })).yearLevel).toBeNull()
    expect(parseStudiesNav(fromParams({ struct: 't1', ylevel: 'x' })).yearLevel).toBeNull()
    expect(parseStudiesNav(fromParams({ struct: 't1', ylevel: '1.5' })).yearLevel).toBeNull()
  })
})

describe('applyStudiesNav', () => {
  it('sets the drill keys and preserves other params (sec)', () => {
    const base = new URLSearchParams({ sec: 'semester_groups' })
    const nav: StudiesNav = { structId: 't1', yearLevel: 2, cohort: 'תשפ״ז', sem: null }
    const out = applyStudiesNav(base, nav)
    expect(out.get('sec')).toBe('semester_groups')
    expect(out.get('struct')).toBe('t1')
    expect(out.get('ylevel')).toBe('2')
    expect(out.get('cohort')).toBe('תשפ״ז')
    expect(out.has('sem')).toBe(false)
  })
  it('deletes deeper keys when a higher level is cleared (hierarchy)', () => {
    const base = new URLSearchParams({ sec: 'semester_groups', struct: 't1', ylevel: '2', cohort: 'c', sem: 's' })
    // Go back to the structure level: keep struct, clear the rest.
    const out = applyStudiesNav(base, { structId: 't1', yearLevel: null, cohort: null, sem: null })
    expect(out.get('struct')).toBe('t1')
    expect(out.has('ylevel')).toBe(false)
    expect(out.has('cohort')).toBe(false)
    expect(out.has('sem')).toBe(false)
    expect(out.get('sec')).toBe('semester_groups')
  })
  it('clearing structId drops year/cohort even if passed', () => {
    const base = new URLSearchParams()
    const out = applyStudiesNav(base, { structId: null, yearLevel: 2, cohort: 'c', sem: null })
    expect(out.has('struct')).toBe(false)
    expect(out.has('ylevel')).toBe(false)
    expect(out.has('cohort')).toBe(false)
  })
  it('round-trips through parse', () => {
    const nav: StudiesNav = { structId: 't1', yearLevel: 'none', cohort: 'none', sem: 'x' }
    const out = applyStudiesNav(new URLSearchParams(), nav)
    expect(parseStudiesNav(k => out.get(k))).toEqual(nav)
  })
  it('kodesh: sem only, no struct — round-trips', () => {
    const nav: StudiesNav = { structId: null, yearLevel: null, cohort: null, sem: 'lvlA' }
    const out = applyStudiesNav(new URLSearchParams({ sec: 'semester_groups' }), nav)
    expect(out.get('sem')).toBe('lvlA')
    expect(out.has('struct')).toBe(false)
    expect(parseStudiesNav(k => out.get(k))).toEqual(nav)
  })
})
