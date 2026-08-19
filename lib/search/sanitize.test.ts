import { describe, it, expect } from 'vitest'
import { sanitizeOrSearch } from './sanitize'

describe('sanitizeOrSearch', () => {
  it('passes plain text through (trimmed)', () => {
    expect(sanitizeOrSearch('  Sarah  ')).toBe('Sarah')
    expect(sanitizeOrSearch('בית ספר')).toBe('בית ספר')
  })

  it('returns empty string for null/undefined/empty', () => {
    expect(sanitizeOrSearch(null)).toBe('')
    expect(sanitizeOrSearch(undefined)).toBe('')
    expect(sanitizeOrSearch('   ')).toBe('')
  })

  it('strips PostgREST filter metacharacters so .or() cannot be injected', () => {
    // запятая — разделитель условий в .or(); скобки — группировка; %/* — wildcard.
    expect(sanitizeOrSearch('a,b')).toBe('a b')
    expect(sanitizeOrSearch('x),email.ilike.(y')).toBe('x  email.ilike. y')
    expect(sanitizeOrSearch('50%')).toBe('50')
    expect(sanitizeOrSearch('a*b')).toBe('a b')
    expect(sanitizeOrSearch('a\\b')).toBe('a b')
  })

  it('never lets a comma, paren, percent, star or backslash survive', () => {
    const dirty = 'foo,%*()\\bar'
    const clean = sanitizeOrSearch(dirty)
    expect(clean).not.toMatch(/[%,()*\\]/)
  })
})
