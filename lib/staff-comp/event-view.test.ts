import { describe, it, expect } from 'vitest'
import { shapeEventForViewer } from './event-view'

const row = {
  id: 'ev1',
  entry_date: '2026-07-17',
  entry_type: 'shabbat_host',
  host_name: 'משפחת כהן',
  summary: 'שבת נעימה עם הבנות',
  private_notes: 'רחל נראתה עצובה — לעקוב',
}

describe('shapeEventForViewer', () => {
  it('privileged viewer sees private_notes', () => {
    const v = shapeEventForViewer(row, { canSeePrivate: true })
    expect(v.private_notes).toBe(row.private_notes)
    expect(v.host_name).toBe('משפחת כהן')
    expect(v.entry_type).toBe('shabbat_host')
  })

  it('student NEVER sees private_notes (key absent)', () => {
    const v = shapeEventForViewer(row, { canSeePrivate: false })
    expect('private_notes' in v).toBe(false)
    expect(JSON.stringify(v)).not.toContain('עצובה')
    expect(v.summary).toBe('שבת נעימה עם הבנות')
  })

  it('privileged viewer with missing private_notes normalizes to null', () => {
    const bare = { id: 'ev2', entry_date: null, entry_type: 'shabbat_family', host_name: '', summary: null }
    const v = shapeEventForViewer(bare, { canSeePrivate: true })
    expect(v.private_notes).toBeNull()
  })
})
