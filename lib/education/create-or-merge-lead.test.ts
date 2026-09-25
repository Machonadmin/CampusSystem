import { describe, it, expect } from 'vitest'
import { decideJourney, buildMergeNote, buildDuplicateNote, newInterests, type JourneyLite } from './create-or-merge-lead'

const j = (id: string, status: string, over: Partial<JourneyLite> = {}): JourneyLite => ({
  id, education_status: status, closed_at: null, is_deleted: false, created_at: `2026-0${id}-01`, ...over,
})

describe('decideJourney', () => {
  it('открытый lead/applicant → переиспользовать', () => {
    expect(decideJourney([j('1', 'lead')])).toEqual({ action: 'reuse', journey: j('1', 'lead') })
    expect(decideJourney([j('1', 'student'), j('2', 'applicant')])).toMatchObject({ action: 'reuse', journey: { id: '2' } })
  })
  it('открытый другой статус → только заметка', () => {
    expect(decideJourney([j('1', 'student')])).toMatchObject({ action: 'note_only', journey: { id: '1' } })
  })
  it('только закрытые или нет → новый journey', () => {
    expect(decideJourney([])).toEqual({ action: 'create' })
    expect(decideJourney([j('1', 'lead', { closed_at: '2026-01-01' })])).toEqual({ action: 'create' })
  })
  it('удалённый открытый journey не переиспользуется → blocked', () => {
    expect(decideJourney([j('1', 'lead', { is_deleted: true })])).toEqual({ action: 'blocked' })
    expect(decideJourney([j('1', 'lead', { is_deleted: true, closed_at: '2026-01-01' })])).toEqual({ action: 'create' })
  })
})

describe('buildMergeNote', () => {
  it('источник, дата, заполненные поля на иврите, комментарий', () => {
    expect(buildMergeNote('טופס באתר', '24.9.2026', ['email', 'phones'], ' hi '))
      .toBe('נרשמה שוב (טופס באתר), 24.9.2026. הושלמו: אימייל, טלפון\nhi')
    expect(buildMergeNote('src', 'd', [])).toBe('נרשמה שוב (src), d. הושלמו: —')
  })
})

describe('buildDuplicateNote', () => {
  it('имя и ссылка на карточку', () => {
    expect(buildDuplicateNote([{ id: 'p1', full_name: 'Cohen Sarah' }, { id: 'p2', full_name: null }]))
      .toBe('ייתכן כפילות עם: Cohen Sarah (/dashboard/persons/p1); — (/dashboard/persons/p2)')
  })
})

describe('newInterests', () => {
  it('только новые направления/тексты, без повторов', () => {
    const existing = [{ direction_id: 'd1', level_id: null, free_text: null }, { direction_id: null, level_id: null, free_text: 'Art' }]
    expect(newInterests(existing, [
      { direction_id: 'd1' }, { direction_id: 'd1', level_id: 'l1' }, { direction_id: 'd2' }, { direction_id: 'd2' },
      { free_text: ' art ' }, { free_text: 'Music' }, { free_text: ' ' },
    ])).toEqual([{ direction_id: 'd1', level_id: 'l1' }, { direction_id: 'd2' }, { free_text: 'Music' }])
  })
})
