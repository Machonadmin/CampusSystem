import { describe, it, expect } from 'vitest'
import { suggestKodeshPlacement, suggestKodeshPlacements } from './assignment-suggestions'

describe('suggestKodeshPlacement — continue_semester', () => {
  it('keeps the same level and stream', () => {
    expect(suggestKodeshPlacement({ journeyId: 'j1', currentLevel: 1, currentStream: 'school' }, 'continue_semester'))
      .toEqual({ journeyId: 'j1', suggestedLevel: 1, suggestedStream: 'school', reason: 'continue' })
    expect(suggestKodeshPlacement({ journeyId: 'j2', currentLevel: 4, currentStream: null }, 'continue_semester'))
      .toEqual({ journeyId: 'j2', suggestedLevel: 4, suggestedStream: null, reason: 'continue' })
  })
})

describe('suggestKodeshPlacement — advance_year', () => {
  it('advances one level, keeping stream on levels 1→2', () => {
    expect(suggestKodeshPlacement({ journeyId: 'j1', currentLevel: 1, currentStream: 'university' }, 'advance_year'))
      .toEqual({ journeyId: 'j1', suggestedLevel: 2, suggestedStream: 'university', reason: 'advance' })
  })
  it('drops the stream when advancing into level 3+ (no streams there)', () => {
    expect(suggestKodeshPlacement({ journeyId: 'j2', currentLevel: 2, currentStream: 'school' }, 'advance_year'))
      .toEqual({ journeyId: 'j2', suggestedLevel: 3, suggestedStream: null, reason: 'advance' })
  })
  it('marks the top level as graduated (no next level)', () => {
    expect(suggestKodeshPlacement({ journeyId: 'j3', currentLevel: 6, currentStream: null }, 'advance_year'))
      .toEqual({ journeyId: 'j3', suggestedLevel: 6, suggestedStream: null, reason: 'graduated' })
  })
})

describe('needs_placement', () => {
  it('flags students with no current level in both modes', () => {
    expect(suggestKodeshPlacement({ journeyId: 'j1', currentLevel: null, currentStream: null }, 'continue_semester').reason)
      .toBe('needs_placement')
    expect(suggestKodeshPlacement({ journeyId: 'j2', currentLevel: 0, currentStream: null }, 'advance_year').reason)
      .toBe('needs_placement')
  })
})

describe('suggestKodeshPlacements (batch)', () => {
  it('maps each student', () => {
    const out = suggestKodeshPlacements([
      { journeyId: 'a', currentLevel: 1, currentStream: 'school' },
      { journeyId: 'b', currentLevel: null, currentStream: null },
    ], 'advance_year')
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ journeyId: 'a', suggestedLevel: 2, reason: 'advance' })
    expect(out[1]).toMatchObject({ journeyId: 'b', reason: 'needs_placement' })
  })
})
