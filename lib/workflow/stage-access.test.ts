import { describe, it, expect } from 'vitest'
import type { SessionPayload } from '@/lib/auth/jwt'
import type { StageContext } from './stage-access'
import { stageSignerAuthority } from './stage-access'

// Здесь тестируется РОЛЕВАЯ ветка stageSignerAuthority — она чистая и
// возвращается ДО обращения к БД (когда у этапа задан required_role_code).
// Это ключевая гарантия независимости приёмной комиссии (issue #26):
// подписать ролевой этап может ТОЛЬКО носитель нужной роли (или superadmin как
// аварийный override), а НЕ любой управленец с manage_leads. Ветка без роли
// ходит в БД (hasEducationPrivilege) и покрывается интеграционно.

function session(roles: string[]): SessionPayload {
  return {
    person_id: 'p1',
    login_email: 'x@example.com',
    full_name: 'Test',
    roles,
  } as SessionPayload
}

function roleStage(requiredRoleCode: string | null): StageContext {
  return {
    stageInstanceId: 'si1',
    stageTemplateId: 'st1',
    stageCode: 'jewishness',
    requiredRoleCode,
    requiresSignature: true,
    journeyId: 'j1',
    departmentId: null,
  }
}

describe('stageSignerAuthority — ролевой этап', () => {
  it('носитель требуемой роли → role', async () => {
    expect(await stageSignerAuthority(session(['doctor']), roleStage('doctor'))).toBe('role')
  })

  it('НЕ носитель роли и не superadmin → null (нельзя подписать чужой этап)', async () => {
    expect(await stageSignerAuthority(session(['recruiter']), roleStage('doctor'))).toBeNull()
  })

  it('manage_leads-роль без нужной роли всё равно НЕ подписывает ролевой этап', async () => {
    // recruiter/куратор может иметь manage_leads, но это НЕ даёт права на
    // ролевой этап врача — иначе набор трогал бы приём (баг из ревью).
    expect(await stageSignerAuthority(session(['recruiter', 'studies_manager']), roleStage('doctor'))).toBeNull()
  })

  it('superadmin → override (аварийный/админский случай)', async () => {
    expect(await stageSignerAuthority(session(['superadmin']), roleStage('doctor'))).toBe('override')
  })

  it('несколько требуемых ролей — достаточно любой', async () => {
    expect(await stageSignerAuthority(session(['psychologist']), roleStage('doctor,psychologist'))).toBe('role')
    expect(await stageSignerAuthority(session(['doctor']), roleStage('doctor,psychologist'))).toBe('role')
  })

  it('несколько требуемых ролей — ни одна не совпала → null', async () => {
    expect(await stageSignerAuthority(session(['recruiter']), roleStage('doctor,psychologist'))).toBeNull()
  })

  it('пробелы в списке ролей обрезаются', async () => {
    expect(await stageSignerAuthority(session(['psychologist']), roleStage('doctor , psychologist'))).toBe('role')
  })
})
