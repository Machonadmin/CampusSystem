import { describe, it, expect } from 'vitest'
import { isValidTrackCode } from './track-catalog'

describe('isValidTrackCode', () => {
  it('accepts lowercase slug codes', () => {
    expect(isValidTrackCode('school')).toBe(true)
    expect(isValidTrackCode('univ_pr')).toBe(true)
    expect(isValidTrackCode('college_g11')).toBe(true)
  })
  it('rejects uppercase, spaces and punctuation', () => {
    expect(isValidTrackCode('School')).toBe(false)
    expect(isValidTrackCode('univ pr')).toBe(false)
    expect(isValidTrackCode('univ-pr')).toBe(false)
    expect(isValidTrackCode('מסלול')).toBe(false)
  })
  it('enforces length bounds (2..40)', () => {
    expect(isValidTrackCode('a')).toBe(false)
    expect(isValidTrackCode('ab')).toBe(true)
    expect(isValidTrackCode('a'.repeat(41))).toBe(false)
  })
  it('trims surrounding whitespace before validating', () => {
    expect(isValidTrackCode('  school  ')).toBe(true)
    expect(isValidTrackCode('   ')).toBe(false)
  })
})
