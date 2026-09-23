import { describe, it, expect } from 'vitest'
import { accessibleNavGroups, isNavItemAccessible } from './nav-items'

describe('accessibleNavGroups', () => {
  it('только то, что доступно; пустые группы опущены', () => {
    const g = accessibleNavGroups({ accessible_modules: ['maintenance', 'food'] }, {})
    expect(g).toEqual([
      { group: 'wellbeing', ids: ['food'] },
      { group: 'operations', ids: ['maintenance'] },
    ])
  })

  it('разделы образования — только при явном доступе (fail-closed)', () => {
    const me = { accessible_modules: ['education'] }
    expect(isNavItemAccessible('recruitment', me, null)).toBe(false)
    expect(isNavItemAccessible('recruitment', me, {})).toBe(false)
    expect(isNavItemAccessible('recruitment', me, { recruitment: true })).toBe(true)
    expect(isNavItemAccessible('admission', me, { committee: true })).toBe(true)
    expect(isNavItemAccessible('studies', me, { study: true })).toBe(true)
    // Без модуля education tab-access не помогает.
    expect(isNavItemAccessible('studies', { accessible_modules: [] }, { study: true })).toBe(false)
  })

  it('здоровье — при доступе к рофэ или психологу', () => {
    expect(isNavItemAccessible('health', { accessible_modules: ['psychologist'] }, null)).toBe(true)
    expect(isNavItemAccessible('health', { accessible_modules: [] }, null)).toBe(false)
  })

  it('хеврута и שכר צוות — по динамическим флагам', () => {
    expect(isNavItemAccessible('chavruta', { accessible_modules: [], is_chavruta_teacher: true }, null)).toBe(true)
    expect(isNavItemAccessible('finance_staff', { accessible_modules: ['finance'] }, null)).toBe(false)
    expect(isNavItemAccessible('finance_staff', { accessible_modules: ['finance'], can_view_staff_comp: true }, null)).toBe(true)
  })
})
