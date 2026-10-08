import { describe, it, expect } from 'vitest'
import { personalEventsToIcs, appointmentsToIcs, tasksToIcs, lessonsToIcs, type FeedLessonRow } from './feed-items'
import { buildICS } from './ics'

describe('appointmentsToIcs', () => {
  const base = { title: 'פגישה עם רחל', reason: null, status: 'scheduled' }

  it('keeps wall-clock time (no +3h shift, fix c1ee3e22)', () => {
    const [ev] = appointmentsToIcs([
      { ...base, id: 'a1', starts_at: '2026-10-05T10:00:00+00:00', ends_at: '2026-10-05T11:30:00+00:00' },
    ])
    expect(ev).toMatchObject({ uid: 'appt-a1@campus', kind: 'floating', start: '20261005T100000', end: '20261005T113000' })
  })

  it('dedupes a meeting I both created and was invited to', () => {
    const row = { ...base, id: 'a1', starts_at: '2026-10-05T10:00:00', ends_at: '2026-10-05T11:00:00' }
    expect(appointmentsToIcs([row, { ...row }])).toHaveLength(1)
  })

  it('skips cancelled meetings and skipped (declined) ids', () => {
    const rows = [
      { ...base, id: 'a1', starts_at: '2026-10-05T10:00:00', ends_at: '2026-10-05T11:00:00', status: 'cancelled' },
      { ...base, id: 'a2', starts_at: '2026-10-05T12:00:00', ends_at: '2026-10-05T13:00:00' },
      { ...base, id: 'a3', starts_at: '2026-10-05T14:00:00', ends_at: '2026-10-05T15:00:00' },
    ]
    expect(appointmentsToIcs(rows, new Set(['a2'])).map(e => e.uid)).toEqual(['appt-a3@campus'])
  })
})

describe('lessonsToIcs', () => {
  const base: FeedLessonRow = {
    id: 'l1', scheduled_date: '2026-10-06', scheduled_time: '09:00:00', scheduled_end_time: '10:30:00',
    location: 'חדר 3', topic: 'פרק א', is_cancelled: false,
    group_name: 'קבוצה 2', subject_he: 'תנ"ך', subject: 'Tanakh',
  }

  it('maps a timed lesson with end, location and topic', () => {
    const [ev] = lessonsToIcs([base])
    expect(ev).toEqual({
      uid: 'lesson-l1@campus', summary: '📚 תנ"ך · קבוצה 2', description: 'פרק א', location: 'חדר 3',
      kind: 'floating', start: '20261006T090000', end: '20261006T103000',
    })
  })

  it('falls back to the base subject name, then a generic title', () => {
    expect(lessonsToIcs([{ ...base, subject_he: null }])[0].summary).toBe('📚 Tanakh · קבוצה 2')
    expect(lessonsToIcs([{ ...base, subject_he: null, subject: null, group_name: null }])[0].summary).toBe('📚 שיעור')
  })

  it('makes an all-day event when the lesson has no time', () => {
    const [ev] = lessonsToIcs([{ ...base, scheduled_time: null }])
    expect(ev).toMatchObject({ kind: 'allday', date: '2026-10-06' })
  })

  it('drops an end time that is not after the start', () => {
    const [ev] = lessonsToIcs([{ ...base, scheduled_end_time: '08:00' }])
    expect(ev).toMatchObject({ kind: 'floating', start: '20261006T090000', end: undefined })
  })

  it('skips cancelled lessons and duplicates (teacher and student of the same group)', () => {
    const out = lessonsToIcs([base, { ...base }, { ...base, id: 'l2', is_cancelled: true }])
    expect(out.map(e => e.uid)).toEqual(['lesson-l1@campus'])
  })
})

describe('personal events and tasks', () => {
  it('maps timed and all-day personal events', () => {
    const out = personalEventsToIcs([
      { id: 'e1', title: 'רופא', notes: 'להביא טופס', event_date: '2026-10-07', event_time: '08:15', all_day: false },
      { id: 'e2', title: null, notes: null, event_date: '2026-10-08', event_time: null, all_day: true },
    ])
    expect(out[0]).toMatchObject({ kind: 'floating', start: '20261007T081500', description: 'להביא טופס' })
    expect(out[1]).toMatchObject({ kind: 'allday', date: '2026-10-08', summary: '(ללא כותרת)' })
  })

  it('maps tasks with a check mark', () => {
    const [t] = tasksToIcs([{ id: 't1', title: 'לשלוח דוח', due_date: '2026-10-09', due_time: null, due_all_day: true }])
    expect(t).toMatchObject({ uid: 'task-t1@campus', summary: '✓ לשלוח דוח', kind: 'allday' })
  })
})

describe('combined feed', () => {
  it('renders all layers into one calendar', () => {
    const ics = buildICS({
      name: 'test',
      now: new Date('2026-10-01T00:00:00Z'),
      events: [
        ...appointmentsToIcs([{ id: 'a1', title: 'פגישה', reason: null, status: null, starts_at: '2026-10-05T10:00:00', ends_at: '2026-10-05T11:00:00' }]),
        ...lessonsToIcs([{ id: 'l1', scheduled_date: '2026-10-06', scheduled_time: '09:00', scheduled_end_time: null, location: null, topic: null, is_cancelled: false, group_name: 'א', subject_he: null, subject: null }]),
        ...tasksToIcs([{ id: 't1', title: 'x', due_date: '2026-10-09', due_time: '12:00', due_all_day: false }]),
      ],
    })
    expect(ics).toContain('UID:appt-a1@campus')
    expect(ics).toContain('UID:lesson-l1@campus')
    expect(ics).toContain('UID:task-t1@campus')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3)
  })
})
