import { describe, it, expect } from 'vitest'
import { reduceScopes, grantsAccess, applyPersonGrants } from './scope'

describe('applyPersonGrants', () => {
  it('без персональных выдач — карта не меняется', () => {
    expect(applyPersonGrants({ view_students: 'all' }, [])).toEqual({ view_students: 'all' })
  })

  it('личная выдача добавляет привилегию в scope=department', () => {
    expect(applyPersonGrants({}, [{ code: 'set_grades', is_granted: true }]))
      .toEqual({ set_grades: 'department' })
  })

  it('личный запрет (is_granted=false) перебивает ролевую выдачу', () => {
    expect(applyPersonGrants({ set_grades: 'all' }, [{ code: 'set_grades', is_granted: false }]))
      .toEqual({})
  })

  it('роль дала all — личная выдача не понижает до department', () => {
    expect(applyPersonGrants({ view_students: 'all' }, [{ code: 'view_students', is_granted: true }]))
      .toEqual({ view_students: 'all' })
  })

  it('личная выдача поверх own — поднимает до department', () => {
    expect(applyPersonGrants({ mark_attendance: 'own' }, [{ code: 'mark_attendance', is_granted: true }]))
      .toEqual({ mark_attendance: 'department' })
  })

  it('несколько выдач и запретов вместе', () => {
    expect(applyPersonGrants(
      { view_students: 'own', set_grades: 'all' },
      [{ code: 'view_students', is_granted: true }, { code: 'set_grades', is_granted: false }, { code: 'mark_attendance', is_granted: true }],
    )).toEqual({ view_students: 'department', mark_attendance: 'department' })
  })

  it('не мутирует исходную карту', () => {
    const base = { view_students: 'own' as const }
    applyPersonGrants(base, [{ code: 'view_students', is_granted: false }])
    expect(base).toEqual({ view_students: 'own' })
  })
})

describe('reduceScopes', () => {
  it('пустой ввод → пустая карта', () => {
    expect(reduceScopes([])).toEqual({})
  })

  it('одна привилегия — берётся её scope', () => {
    expect(reduceScopes([{ privilege_code: 'view', scope: 'department' }]))
      .toEqual({ view: 'department' })
  })

  it('несколько ролей на одну привилегию → максимальный scope (all > department > own)', () => {
    expect(reduceScopes([
      { privilege_code: 'view', scope: 'own' },
      { privilege_code: 'view', scope: 'all' },
      { privilege_code: 'view', scope: 'department' },
    ])).toEqual({ view: 'all' })
  })

  it('department побеждает own, но не all', () => {
    expect(reduceScopes([
      { privilege_code: 'edit', scope: 'own' },
      { privilege_code: 'edit', scope: 'department' },
    ])).toEqual({ edit: 'department' })
  })

  it('порядок строк не влияет на результат', () => {
    const a = reduceScopes([
      { privilege_code: 'x', scope: 'all' },
      { privilege_code: 'x', scope: 'own' },
    ])
    const b = reduceScopes([
      { privilege_code: 'x', scope: 'own' },
      { privilege_code: 'x', scope: 'all' },
    ])
    expect(a).toEqual(b)
    expect(a).toEqual({ x: 'all' })
  })

  it('разные привилегии не смешиваются', () => {
    expect(reduceScopes([
      { privilege_code: 'view', scope: 'all' },
      { privilege_code: 'manage', scope: 'own' },
    ])).toEqual({ view: 'all', manage: 'own' })
  })

  it('неизвестный scope игнорируется', () => {
    expect(reduceScopes([
      { privilege_code: 'view', scope: 'galaxy' },
    ])).toEqual({})
  })
})

describe('grantsAccess', () => {
  const ctx = { departmentIds: ['dep-1', 'dep-2'], personId: 'me' }

  it('нет scope → нет доступа', () => {
    expect(grantsAccess(undefined, undefined, ctx)).toBe(false)
  })

  it('scope=all → доступ всегда, даже с любой целью', () => {
    expect(grantsAccess('all', undefined, ctx)).toBe(true)
    expect(grantsAccess('all', { department_id: 'other' }, ctx)).toBe(true)
  })

  describe('scope=department', () => {
    it('без target.department_id → доступ (общий пул)', () => {
      expect(grantsAccess('department', undefined, ctx)).toBe(true)
      expect(grantsAccess('department', {}, ctx)).toBe(true)
    })

    it('цель в моих подразделениях → доступ', () => {
      expect(grantsAccess('department', { department_id: 'dep-1' }, ctx)).toBe(true)
    })

    it('цель в чужом подразделении → нет доступа', () => {
      expect(grantsAccess('department', { department_id: 'dep-9' }, ctx)).toBe(false)
    })
  })

  describe('scope=own', () => {
    it('я в списке ответственных → доступ', () => {
      expect(grantsAccess('own', { teacher_ids: ['someone', 'me'] }, ctx)).toBe(true)
    })

    it('меня нет в списке → нет доступа', () => {
      expect(grantsAccess('own', { teacher_ids: ['someone'] }, ctx)).toBe(false)
    })

    it('пустой или отсутствующий список → нет доступа', () => {
      expect(grantsAccess('own', { teacher_ids: [] }, ctx)).toBe(false)
      expect(grantsAccess('own', undefined, ctx)).toBe(false)
      expect(grantsAccess('own', {}, ctx)).toBe(false)
    })
  })
})
