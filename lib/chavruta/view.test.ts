import { describe, it, expect } from 'vitest'
import { shapeChavrutaSessionForViewer } from './view'

const row = {
  id: 'e1',
  entry_date: '2026-07-15',
  teacher_name: 'מרים',
  summary: 'למדנו פרק ב',
  private_notes: 'הערה פרטית שהתלמידה לא צריכה לראות',
}

describe('shapeChavrutaSessionForViewer', () => {
  it('staff sees private_notes', () => {
    const v = shapeChavrutaSessionForViewer(row, { isStaff: true })
    expect(v.private_notes).toBe(row.private_notes)
    expect(v.summary).toBe('למדנו פרק ב')
    expect(v.teacher_name).toBe('מרים')
  })

  it('student NEVER sees private_notes (key absent entirely)', () => {
    const v = shapeChavrutaSessionForViewer(row, { isStaff: false })
    expect('private_notes' in v).toBe(false)
    expect(JSON.stringify(v)).not.toContain('פרטית')
    // публичные поля всё же видны
    expect(v.summary).toBe('למדנו פרק ב')
    expect(v.teacher_name).toBe('מרים')
    expect(v.entry_date).toBe('2026-07-15')
  })

  it('staff with null private_notes gets null, not undefined', () => {
    const v = shapeChavrutaSessionForViewer({ ...row, private_notes: null }, { isStaff: true })
    expect(v.private_notes).toBeNull()
  })

  it('staff with missing private_notes field normalizes to null', () => {
    const bare = { id: 'e2', entry_date: null, teacher_name: '', summary: null }
    const v = shapeChavrutaSessionForViewer(bare, { isStaff: true })
    expect(v.private_notes).toBeNull()
  })
})
