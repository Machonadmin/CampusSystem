import { describe, expect, it } from 'vitest'
import { IDLE_RETURN_MS, isEditScreen, parseHiddenAt, shouldReturnHome, type IdleReturnInput } from './idle-return-home'

const base: IdleReturnInput = {
  awayMs: IDLE_RETURN_MS,
  pathname: '/dashboard/alumni',
  isTouchDevice: true,
  dialogOpen: false,
  editedOnScreen: false,
}

describe('shouldReturnHome', () => {
  it('returns home after an hour away on a phone', () => {
    expect(shouldReturnHome(base)).toBe(true)
    expect(shouldReturnHome({ ...base, awayMs: 3 * 24 * IDLE_RETURN_MS })).toBe(true)
  })

  it('stays put when away for less than an hour', () => {
    expect(shouldReturnHome({ ...base, awayMs: IDLE_RETURN_MS - 1 })).toBe(false)
    expect(shouldReturnHome({ ...base, awayMs: 0 })).toBe(false)
    expect(shouldReturnHome({ ...base, awayMs: Number.NaN })).toBe(false)
  })

  it('stays put on a computer', () => {
    expect(shouldReturnHome({ ...base, isTouchDevice: false })).toBe(false)
  })

  it('stays put while a modal window is open or something was typed', () => {
    expect(shouldReturnHome({ ...base, dialogOpen: true })).toBe(false)
    expect(shouldReturnHome({ ...base, editedOnScreen: true })).toBe(false)
  })

  it('stays put on edit screens', () => {
    expect(shouldReturnHome({ ...base, pathname: '/dashboard/education/leads/abc/edit' })).toBe(false)
    expect(shouldReturnHome({ ...base, pathname: '/dashboard/education/students/abc/edit' })).toBe(false)
  })

  it('only acts inside the staff dashboard', () => {
    expect(shouldReturnHome({ ...base, pathname: '/portal' })).toBe(false)
    expect(shouldReturnHome({ ...base, pathname: '/login' })).toBe(false)
  })
})

describe('isEditScreen', () => {
  it('matches edit and new segments only', () => {
    expect(isEditScreen('/dashboard/x/edit')).toBe(true)
    expect(isEditScreen('/dashboard/x/new')).toBe(true)
    expect(isEditScreen('/dashboard/x/edit/step')).toBe(true)
    expect(isEditScreen('/dashboard/news')).toBe(false)
    expect(isEditScreen('/dashboard/x/editor-notes')).toBe(false)
    expect(isEditScreen('/dashboard/alumni')).toBe(false)
  })
})

describe('parseHiddenAt', () => {
  it('reads a stored timestamp and rejects junk', () => {
    expect(parseHiddenAt('1763450000000')).toBe(1763450000000)
    expect(parseHiddenAt(null)).toBe(null)
    expect(parseHiddenAt('')).toBe(null)
    expect(parseHiddenAt('abc')).toBe(null)
    expect(parseHiddenAt('-5')).toBe(null)
  })
})
