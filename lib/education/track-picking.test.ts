import { describe, it, expect } from 'vitest'
import { canPairTracks, planAddToTrack, planRemoveFromTrack, type TrackLite } from './track-picking'

const touro: TrackLite = { id: 't', code: 'touro', category: null }
const uni: TrackLite = { id: 'u', code: 'university', category: 'university' }
const econ: TrackLite = { id: 'e', code: 'univ_economics', category: 'university' }
const school: TrackLite = { id: 's', code: 'school', category: 'school' }
const college: TrackLite = { id: 'c', code: 'college_g9', category: 'college' }
const catalog = new Map([touro, uni, econ, school, college].map(t => [t.id, t]))

describe('canPairTracks', () => {
  it('טורו ↔ אוניברסיטה в обе стороны, включая univ_*', () => {
    expect(canPairTracks(touro, uni)).toBe(true)
    expect(canPairTracks(uni, touro)).toBe(true)
    expect(canPairTracks(econ, touro)).toBe(true)
  })
  it('прочие пары запрещены', () => {
    expect(canPairTracks(touro, school)).toBe(false)
    expect(canPairTracks(uni, econ)).toBe(false)
    expect(canPairTracks(school, college)).toBe(false)
  })
})

describe('planAddToTrack', () => {
  it('без маршрутов → главный', () => {
    expect(planAddToTrack(touro, [], catalog)).toEqual({ kind: 'add', role: 'primary' })
  })
  it('уже в маршруте', () => {
    expect(planAddToTrack(touro, [{ track_id: 't', role: 'additional' }], catalog)).toEqual({ kind: 'already' })
  })
  it('университет главный → טורו дополнительный', () => {
    expect(planAddToTrack(touro, [{ track_id: 'u', role: 'primary' }], catalog)).toEqual({ kind: 'add', role: 'additional' })
  })
  it('טורו главный → университет дополнительный', () => {
    expect(planAddToTrack(econ, [{ track_id: 't', role: 'primary' }], catalog)).toEqual({ kind: 'add', role: 'additional' })
  })
  it('только дополнительный → новый становится главным', () => {
    expect(planAddToTrack(uni, [{ track_id: 't', role: 'additional' }], catalog)).toEqual({ kind: 'add', role: 'primary' })
  })
  it('чужой несовместимый маршрут → блок', () => {
    expect(planAddToTrack(touro, [{ track_id: 's', role: 'primary' }], catalog))
      .toEqual({ kind: 'blocked', reason: 'other_track', trackIds: ['s'] })
  })
  it('уже два маршрута → блок', () => {
    const rows = [{ track_id: 't', role: 'primary' as const }, { track_id: 'u', role: 'additional' as const }]
    expect(planAddToTrack(econ, rows, catalog)).toEqual({ kind: 'blocked', reason: 'two_tracks', trackIds: ['t', 'u'] })
  })
})

describe('planRemoveFromTrack', () => {
  it('не в маршруте', () => {
    expect(planRemoveFromTrack('t', [])).toEqual({ kind: 'not_in_track' })
  })
  it('снять дополнительный', () => {
    expect(planRemoveFromTrack('t', [{ track_id: 'u', role: 'primary' }, { track_id: 't', role: 'additional' }]))
      .toEqual({ kind: 'remove', promoteTrackId: null })
  })
  it('снять главный → дополнительный становится главным', () => {
    expect(planRemoveFromTrack('t', [{ track_id: 't', role: 'primary' }, { track_id: 'u', role: 'additional' }]))
      .toEqual({ kind: 'remove', promoteTrackId: 'u' })
  })
})
