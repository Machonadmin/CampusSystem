import { describe, it, expect } from 'vitest'
import { isIsoDateStr, isTimeStr, isGoalStatus, isProgress, cleanText, reminderAtFor } from './validation'

describe('management validation', () => {
  it('dates and times', () => {
    expect(isIsoDateStr('2026-11-03')).toBe(true)
    expect(isIsoDateStr('2026-02-30')).toBe(false)
    expect(isIsoDateStr('3.11.2026')).toBe(false)
    expect(isTimeStr('09:30')).toBe(true)
    expect(isTimeStr('9:30')).toBe(false)
  })
  it('status and progress', () => {
    expect(isGoalStatus('achieved')).toBe(true)
    expect(isGoalStatus('done')).toBe(false)
    expect(isProgress(0)).toBe(true)
    expect(isProgress(100)).toBe(true)
    expect(isProgress(101)).toBe(false)
    expect(isProgress(50.5)).toBe(false)
  })
  it('cleanText', () => {
    expect(cleanText('  a  ', 10)).toBe('a')
    expect(cleanText('   ', 10)).toBeNull()
    expect(cleanText(5, 10)).toBeNull()
    expect(cleanText('abcdef', 3)).toBe('abc')
  })
  it('reminderAtFor: day before at 06:00Z, only in the future', () => {
    const now = new Date('2026-11-03T10:00:00Z')
    expect(reminderAtFor('2026-11-10', now)).toBe('2026-11-09T06:00:00.000Z')
    expect(reminderAtFor('2026-11-04', now)).toBeNull()
    expect(reminderAtFor('2026-11-01', now)).toBeNull()
  })
})
