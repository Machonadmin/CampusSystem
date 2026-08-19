import { describe, it, expect } from 'vitest'
import { landingRouteForRoles } from './landing'

describe('landingRouteForRoles — умная посадка по роли', () => {
  it('admin-роли → полная сетка модулей', () => {
    expect(landingRouteForRoles(['superadmin'])).toBe('/dashboard')
    expect(landingRouteForRoles(['campus_admin'])).toBe('/dashboard')
    // admin имеет приоритет даже при наличии другой роли
    expect(landingRouteForRoles(['teacher', 'superadmin'])).toBe('/dashboard')
  })

  it('учитель → мой день', () => {
    expect(landingRouteForRoles(['teacher'])).toBe('/dashboard/education/my-day')
  })

  it('набор/учёба → модуль обучения', () => {
    expect(landingRouteForRoles(['recruiter'])).toBe('/dashboard/education')
    expect(landingRouteForRoles(['studies_manager'])).toBe('/dashboard/education')
  })

  it('доктор/еврейство/кухня → свои модули', () => {
    expect(landingRouteForRoles(['campus_doctor'])).toBe('/dashboard/doctor')
    expect(landingRouteForRoles(['jewishness_officer'])).toBe('/dashboard/jewishness')
    expect(landingRouteForRoles(['kitchen'])).toBe('/dashboard/food')
  })

  it('неизвестная роль / пусто / null → /dashboard', () => {
    expect(landingRouteForRoles(['unknown_role'])).toBe('/dashboard')
    expect(landingRouteForRoles([])).toBe('/dashboard')
    expect(landingRouteForRoles(null)).toBe('/dashboard')
    expect(landingRouteForRoles(undefined)).toBe('/dashboard')
  })
})
