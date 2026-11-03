import { describe, it, expect } from 'vitest'
import { isCourseResultStatus, isValidFinalGrade, averagePercent, submissionState } from './courses'

describe('course results validation', () => {
  it('statuses', () => {
    expect(isCourseResultStatus('passed')).toBe(true)
    expect(isCourseResultStatus('done')).toBe(false)
    expect(isCourseResultStatus(undefined)).toBe(false)
  })
  it('final grade', () => {
    expect(isValidFinalGrade(null)).toBe(true)
    expect(isValidFinalGrade(0)).toBe(true)
    expect(isValidFinalGrade(87.5)).toBe(true)
    expect(isValidFinalGrade(100)).toBe(true)
    expect(isValidFinalGrade(101)).toBe(false)
    expect(isValidFinalGrade(-1)).toBe(false)
    expect(isValidFinalGrade('90')).toBe(false)
    expect(isValidFinalGrade(NaN)).toBe(false)
  })
})

describe('averagePercent', () => {
  it('normalises by max_score and skips ungraded', () => {
    expect(averagePercent([])).toBeNull()
    expect(averagePercent([{ score: null, max_score: 100 }])).toBeNull()
    expect(averagePercent([{ score: 8, max_score: 10 }, { score: 90, max_score: 100 }, { score: null, max_score: 50 }])).toBe(85)
  })
})

describe('submissionState', () => {
  const today = '2026-11-10'
  it('submitted on time / late', () => {
    expect(submissionState('2026-11-10', '2026-11-10T21:00:00Z', today)).toBe('submitted')
    expect(submissionState('2026-11-09', '2026-11-10T08:00:00Z', today)).toBe('late')
    expect(submissionState(null, '2026-11-10T08:00:00Z', today)).toBe('submitted')
  })
  it('not submitted', () => {
    expect(submissionState('2026-11-09', null, today)).toBe('missing')
    expect(submissionState('2026-11-10', null, today)).toBe('open')
    expect(submissionState(null, null, today)).toBe('open')
  })
})
