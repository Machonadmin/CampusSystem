import { describe, it, expect } from 'vitest'
import {
  seatsFromRows,
  structureEducationPrivileges,
  structurePrivilegeRows,
  STRUCTURE_LEAD_PRIVILEGES,
  STRUCTURE_SECRETARY_PRIVILEGES,
  NO_SEATS,
} from './structure-rules'

const today = '2026-11-09'

describe('seatsFromRows', () => {
  it('берёт только действующие посадки; глава и заместитель раздельно', () => {
    expect(seatsFromRows([
      { department_id: 'touro', is_head: true, end_date: null },
      { department_id: 'college', is_deputy: true, end_date: '2027-01-01' },
      { department_id: 'old', is_head: true, end_date: '2026-01-01' },
      { department_id: 'closed_today', is_deputy: true, end_date: today },
    ], today)).toEqual({ headUnitIds: ['touro'], deputyUnitIds: ['college'], hasActiveSeat: true })
  })

  it('нет действующих посадок — ничего', () => {
    expect(seatsFromRows([{ department_id: 'old', is_head: true, end_date: '2026-01-01' }], today)).toEqual(NO_SEATS)
  })

  it('колонки is_deputy нет (до миграции) — заместителей нет', () => {
    expect(seatsFromRows([{ department_id: 'u', is_head: false, end_date: null }], today))
      .toEqual({ headUnitIds: [], deputyUnitIds: [], hasActiveSeat: true })
  })
})

describe('structureEducationPrivileges', () => {
  it('глава получает набор главы', () => {
    const seats = { headUnitIds: ['touro'], deputyUnitIds: [], hasActiveSeat: true }
    expect(structureEducationPrivileges(seats, []).sort()).toEqual([...STRUCTURE_LEAD_PRIVILEGES].sort())
  })

  it('заместитель получает тот же набор, что и глава', () => {
    const seats = { headUnitIds: [], deputyUnitIds: ['touro'], hasActiveSeat: true }
    expect(structureEducationPrivileges(seats, []).sort()).toEqual([...STRUCTURE_LEAD_PRIVILEGES].sort())
  })

  it('секретариат: роль studies_secretary + действующая посадка', () => {
    const seats = { headUnitIds: [], deputyUnitIds: [], hasActiveSeat: true }
    expect(structureEducationPrivileges(seats, ['studies_secretary']).sort())
      .toEqual([...STRUCTURE_SECRETARY_PRIVILEGES].sort())
  })

  it('роль секретаря без посадки — ничего', () => {
    expect(structureEducationPrivileges(NO_SEATS, ['studies_secretary'])).toEqual([])
  })

  it('учитель с посадкой — ничего из структуры (его права — свои группы)', () => {
    const seats = { headUnitIds: [], deputyUnitIds: [], hasActiveSeat: true }
    expect(structureEducationPrivileges(seats, ['teacher'])).toEqual([])
  })

  it('лиды, абитуриентки, кодеш и каталог маршрутов структура не даёт никогда', () => {
    const seats = { headUnitIds: ['u'], deputyUnitIds: ['u'], hasActiveSeat: true }
    const got = structureEducationPrivileges(seats, ['studies_secretary'])
    for (const p of ['view_leads', 'manage_leads', 'view_applicants', 'manage_applicants', 'enroll_applicant',
      'create_kodesh_course', 'approve_kodesh_teacher', 'set_teacher_quota', 'manage_tracks',
      'jewishness_initial_check', 'jewishness_final_approve', 'delegate_privileges']) {
      expect(got).not.toContain(p)
    }
  })
})

describe('structurePrivilegeRows', () => {
  it('ничего не даёт — ни одной строки (даже access)', () => {
    expect(structurePrivilegeRows(NO_SEATS, [])).toEqual([])
  })

  it('всё в модуле education, scope=department, плюс access', () => {
    const rows = structurePrivilegeRows({ headUnitIds: ['u'], deputyUnitIds: [], hasActiveSeat: true }, [])
    expect(rows.every(r => r.module === 'education' && r.scope === 'department')).toBe(true)
    expect(rows.map(r => r.privilege_code)).toContain('access')
  })
})
