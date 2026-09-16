import { describe, it, expect } from 'vitest'
import { resolvePersonPrivileges, indexByPrivilege } from './person'
import { privilegeKey } from './tree'

// Экран «по сотруднику» обязан показывать ровно то, что произойдёт при реальном
// запросе. Эти тесты фиксируют совпадение с правилами выдачи — и отдельно то,
// что администратору видно, ОТКУДА право взялось: без источника он видит
// галочку и не понимает, что будет, если сменить человеку должность.

const role = (module: string, code: string, scope = 'all') =>
  ({ module, privilege_code: code, scope })
const personal = (module: string, code: string, is_granted: boolean, expires_at: string | null = null) =>
  ({ module, privilege_code: code, is_granted, expires_at })

const NOW = Date.UTC(2026, 8, 16)
const FUTURE = new Date(NOW + 86_400_000).toISOString()
const PAST = new Date(NOW - 86_400_000).toISOString()

const find = (rows: ReturnType<typeof resolvePersonPrivileges>, module: string, code: string) =>
  rows.find(r => r.module === module && r.code === code)

describe('источник права виден администратору', () => {
  it('право от должности', () => {
    const r = find(resolvePersonPrivileges([role('studies', 'set_grades')], [], NOW), 'studies', 'set_grades')
    expect(r).toMatchObject({ granted: true, source: 'role', scope: 'all' })
  })

  it('право, открытое лично человеку без всякой должности', () => {
    const r = find(resolvePersonPrivileges([], [personal('studies', 'set_grades', true)], NOW), 'studies', 'set_grades')
    // applyPersonGrants даёт личной выдаче минимум department — как при проверке.
    expect(r).toMatchObject({ granted: true, source: 'personal_grant', scope: 'department' })
  })

  it('личный запрет сильнее должности', () => {
    const r = find(resolvePersonPrivileges(
      [role('studies', 'set_grades')], [personal('studies', 'set_grades', false)], NOW,
    ), 'studies', 'set_grades')
    expect(r).toMatchObject({ granted: false, source: 'personal_deny', scope: null })
  })

  it('запрет на право, которого должность не давала, помечен как ни на что не влияющий', () => {
    const r = find(resolvePersonPrivileges([], [personal('studies', 'set_grades', false)], NOW), 'studies', 'set_grades')
    expect(r).toMatchObject({ granted: false, source: 'personal_deny_noop' })
  })

  it('личная выдача не понижает область, которую уже дала должность', () => {
    const r = find(resolvePersonPrivileges(
      [role('studies', 'set_grades', 'all')], [personal('studies', 'set_grades', true)], NOW,
    ), 'studies', 'set_grades')
    expect(r?.scope).toBe('all')
  })

  it('из нескольких ролей берётся самая широкая область', () => {
    const r = find(resolvePersonPrivileges(
      [role('studies', 'view_students', 'own'), role('studies', 'view_students', 'department')], [], NOW,
    ), 'studies', 'view_students')
    expect(r?.scope).toBe('department')
  })
})

describe('срок действия личной выдачи', () => {
  it('выдача с будущим сроком действует и срок показывается', () => {
    const r = find(resolvePersonPrivileges([], [personal('studies', 'set_grades', true, FUTURE)], NOW), 'studies', 'set_grades')
    expect(r).toMatchObject({ granted: true, expiresAt: FUTURE, expired: false })
  })

  it('истёкшая выдача не действует, но остаётся видна как история', () => {
    const rows = resolvePersonPrivileges([], [personal('studies', 'set_grades', true, PAST)], NOW)
    const r = find(rows, 'studies', 'set_grades')
    expect(r).toMatchObject({ granted: false, expired: true, expiresAt: PAST })
  })

  it('истёкший ЗАПРЕТ возвращает право от должности', () => {
    const rows = resolvePersonPrivileges(
      [role('studies', 'set_grades')], [personal('studies', 'set_grades', false, PAST)], NOW,
    )
    const r = find(rows, 'studies', 'set_grades')
    expect(r).toMatchObject({ granted: true, source: 'role' })
  })
})

describe('раскладка по модулям', () => {
  it('модули не влияют друг на друга', () => {
    const rows = resolvePersonPrivileges(
      [role('studies', 'set_grades'), role('finance', 'view')],
      [personal('finance', 'view', false)],
      NOW,
    )
    expect(find(rows, 'studies', 'set_grades')?.granted).toBe(true)
    expect(find(rows, 'finance', 'view')?.granted).toBe(false)
  })

  it('человек без ролей и без личных выдач не получает ничего', () => {
    expect(resolvePersonPrivileges([], [], NOW)).toEqual([])
  })

  it('результат отсортирован — экран не должен сортировать сам', () => {
    const rows = resolvePersonPrivileges(
      [role('studies', 'b'), role('finance', 'a'), role('studies', 'a')], [], NOW,
    )
    expect(rows.map(r => `${r.module}.${r.code}`)).toEqual(['finance.a', 'studies.a', 'studies.b'])
  })
})

describe('indexByPrivilege', () => {
  it('находит право по ключу модуль+код', () => {
    const rows = resolvePersonPrivileges([role('studies', 'set_grades')], [], NOW)
    expect(indexByPrivilege(rows).get(privilegeKey('studies', 'set_grades'))?.granted).toBe(true)
  })
})
