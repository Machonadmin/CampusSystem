import { describe, it, expect } from 'vitest'
import type { SessionPayload } from '@/lib/auth/jwt'
import {
  hasEducationPrivilege,
  canDoEducationInAny,
  getEducationPrivilegeScope,
} from '@/lib/education/permissions'
import { canManageUnit } from '@/lib/education/unit-access'

/**
 * Изоляция портала (בידוד): токен студентки (principal='student') НИКОГДА не
 * получает штатных education-прав — даже если этот же person где-то оформлен
 * сотрудником/главой (проверки идут по person_id). Так студентка не может
 * читать чужие journeys через staff-роуты. Эти проверки чисты (для student
 * ветка обрывается до любого обращения к БД), поэтому тестируются без моков.
 *
 * Портал даёт студентке доступ к СВОЕЙ journey отдельным self-gate в роутах
 * (principal==='student' && student_journey_id===params.id) — это тут не про то.
 */

function studentSession(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    person_id: 'person-1',
    login_email: 's@test',
    full_name: 'Student One',
    roles: [],
    principal: 'student',
    student_journey_id: 'journey-1',
    ...overrides,
  } as SessionPayload
}

describe('Изоляция портала — студентка не имеет штатных education-прав', () => {
  it('hasEducationPrivilege(view_students) без цели → false', async () => {
    expect(await hasEducationPrivilege(studentSession(), 'view_students')).toBe(false)
  })

  it('hasEducationPrivilege(view_students, department) → false', async () => {
    expect(await hasEducationPrivilege(studentSession(), 'view_students', { department_id: 'dept-X' })).toBe(false)
  })

  it('hasEducationPrivilege(manage_students, own=сам person) → false', async () => {
    // Даже own-scope с её собственным person_id не должен пройти: привилегии нет.
    expect(await hasEducationPrivilege(studentSession(), 'manage_students', { teacher_ids: ['person-1'] })).toBe(false)
  })

  it('canDoEducationInAny(view_students) → false', async () => {
    expect(await canDoEducationInAny(studentSession(), 'view_students')).toBe(false)
  })

  it('getEducationPrivilegeScope(view_students) → null', async () => {
    expect(await getEducationPrivilegeScope(studentSession(), 'view_students')).toBe(null)
  })

  it('canManageUnit(любая единица) → false', async () => {
    expect(await canManageUnit(studentSession(), 'kodesh-dept')).toBe(false)
  })

  it('даже подделанный student-токен с ролями/superadmin не получает прав', async () => {
    // Гейт по principal='student' срабатывает РАНЬШЕ проверки ролей.
    const forged = studentSession({ roles: ['superadmin', 'head_of_studies'] })
    expect(await hasEducationPrivilege(forged, 'manage_students', { department_id: 'dept-X' })).toBe(false)
    expect(await canManageUnit(forged, 'dept-X')).toBe(false)
    expect(await canDoEducationInAny(forged, 'view_students')).toBe(false)
  })
})
