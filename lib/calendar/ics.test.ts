import { describe, it, expect } from 'vitest'
import { escapeICS, foldLine, toUtcStamp, toDateStamp, toFloating, buildICS } from './ics'

describe('ICS helpers', () => {
  it('escapes special characters per RFC 5545', () => {
    expect(escapeICS('a,b;c\\d')).toBe('a\\,b\\;c\\\\d')
    expect(escapeICS('line1\nline2')).toBe('line1\\nline2')
  })

  it('folds lines longer than 75 octets with a leading space', () => {
    const short = 'x'.repeat(70)
    expect(foldLine(short)).toBe(short)
    const long = 'y'.repeat(200)
    const folded = foldLine(long)
    expect(folded).toContain('\r\n ')
    // Развёртка обратно даёт исходную строку.
    expect(folded.replace(/\r\n /g, '')).toBe(long)
  })

  it('formats UTC/date/floating stamps', () => {
    expect(toUtcStamp(new Date('2026-08-18T09:05:00Z'))).toBe('20260818T090500Z')
    expect(toDateStamp('2026-08-18')).toBe('20260818')
    expect(toFloating('2026-08-18', '9:05')).toBe('20260818T090500')
  })
})

describe('buildICS', () => {
  const now = new Date('2026-08-01T00:00:00Z')

  it('emits a valid VCALENDAR skeleton', () => {
    const ics = buildICS({ name: 'יומן', events: [], now })
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('VERSION:2.0')
    expect(ics).toContain('X-WR-CALNAME:יומן')
  })

  it('renders all-day, floating and utc events', () => {
    const ics = buildICS({
      now,
      name: 'cal',
      events: [
        { uid: 'a@x', summary: 'יום שלם', kind: 'allday', date: '2026-08-12' },
        { uid: 'b@x', summary: 'שיעור', kind: 'floating', start: '20260818T090000' },
        { uid: 'c@x', summary: 'פגישה', description: 'הערה', kind: 'utc', start: new Date('2026-08-20T11:00:00Z'), end: new Date('2026-08-20T12:00:00Z') },
      ],
    })
    expect(ics).toContain('DTSTART;VALUE=DATE:20260812')
    expect(ics).toContain('DTSTART:20260818T090000')
    expect(ics).toContain('DTSTART:20260820T110000Z')
    expect(ics).toContain('DTEND:20260820T120000Z')
    expect(ics).toContain('SUMMARY:פגישה')
    expect(ics).toContain('DESCRIPTION:הערה')
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(3)
  })
})
