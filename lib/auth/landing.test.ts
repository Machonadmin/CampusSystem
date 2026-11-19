import { describe, it, expect } from 'vitest'
import { landingRouteForRoles, hasBroaderAdminRole, safeInternalPath } from './landing'

// Каждый входит на общий главный экран /dashboard. Особого «дома» у главы
// кафедры иудаики больше нет (решение владельца 19.11.2026): «מרחב יהדות» —
// обычный модуль меню.
describe('landingRouteForRoles', () => {
  it('любая роль → /dashboard', () => {
    expect(landingRouteForRoles(['superadmin'])).toBe('/dashboard')
    expect(landingRouteForRoles(['teacher'])).toBe('/dashboard')
    expect(landingRouteForRoles(['recruiter'])).toBe('/dashboard')
    expect(landingRouteForRoles(['studies_manager'])).toBe('/dashboard')
    expect(landingRouteForRoles(['jewishness_officer'])).toBe('/dashboard')
    expect(landingRouteForRoles(['teacher', 'superadmin'])).toBe('/dashboard')
    expect(landingRouteForRoles(['campus_admin'])).toBe('/dashboard')
  })

  it('неизвестная роль / пусто / null → /dashboard', () => {
    expect(landingRouteForRoles(['unknown_role'])).toBe('/dashboard')
    expect(landingRouteForRoles([])).toBe('/dashboard')
    expect(landingRouteForRoles(null)).toBe('/dashboard')
    expect(landingRouteForRoles(undefined)).toBe('/dashboard')
  })
})

describe('hasBroaderAdminRole', () => {
  it('true только для superadmin', () => {
    expect(hasBroaderAdminRole(['superadmin'])).toBe(true)
    expect(hasBroaderAdminRole(['teacher', 'superadmin'])).toBe(true)
  })
  it('false для прочих / пусто / null', () => {
    expect(hasBroaderAdminRole(['teacher'])).toBe(false)
    expect(hasBroaderAdminRole([])).toBe(false)
    expect(hasBroaderAdminRole(null)).toBe(false)
    expect(hasBroaderAdminRole(undefined)).toBe(false)
  })
  // Регрессия: список «широких админов» держим закрытым — несуществующие коды
  // ролей (campus_admin, admin, campus_doctor) не должны молча давать права.
  it('false для несуществующих кодов ролей (§25 Q4)', () => {
    expect(hasBroaderAdminRole(['campus_admin'])).toBe(false)
    expect(hasBroaderAdminRole(['teacher', 'campus_admin'])).toBe(false)
    expect(hasBroaderAdminRole(['admin'])).toBe(false)
    expect(hasBroaderAdminRole(['campus_doctor'])).toBe(false)
  })
})

// ?from после входа: только внутренний путь, иначе — открытый редирект
// (фишинговая ссылка на настоящую страницу входа уводит на чужой сайт).
describe('safeInternalPath', () => {
  it('внутренний путь пропускается как есть', () => {
    expect(safeInternalPath('/dashboard')).toBe('/dashboard')
    expect(safeInternalPath('/dashboard/persons/abc?tab=docs')).toBe('/dashboard/persons/abc?tab=docs')
  })

  it('пусто → null', () => {
    expect(safeInternalPath(null)).toBeNull()
    expect(safeInternalPath(undefined)).toBeNull()
    expect(safeInternalPath('')).toBeNull()
  })

  it('чужой сайт и схемы → null', () => {
    expect(safeInternalPath('https://evil.example')).toBeNull()
    expect(safeInternalPath('//evil.example')).toBeNull()
    expect(safeInternalPath('/\\evil.example')).toBeNull()
    expect(safeInternalPath('/\\/evil.example')).toBeNull()
    expect(safeInternalPath('javascript:alert(1)')).toBeNull()
    expect(safeInternalPath('dashboard')).toBeNull()
  })

  it('управляющие символы → null', () => {
    expect(safeInternalPath('/\t/evil.example')).toBeNull()
    expect(safeInternalPath('/dash\nboard')).toBeNull()
  })
})
