import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Контракт: доступ решают роли И личные строки ────────────────────────────
//
// Этот файл когда-то читал ТОЛЬКО role_privileges. Пока права жили на
// должностях, расхождение с остальной системой было незаметно. Когда владелец
// снял права с должностей и перевёл их на людей, оно стало поломкой худшего
// вида: гейт модуля личные выдачи учитывает, и плитка «מאגר האנשים» в меню
// появлялась, а экран за ней отдавал 403.
//
// Первая попытка застраховаться была статической — «файл упоминает
// applyPersonGrants». Она НЕ поймала откат: импорты остались на месте, а логика
// исчезла. Поэтому проверка здесь поведенческая: подменяем Supabase и
// спрашиваем ответ, а не ищем слова в исходнике.

type Rows = Record<string, { data?: unknown[]; error?: unknown }>

let rows: Rows = {}

/** Заглушка Supabase: один и тот же ответ на любую цепочку вызовов таблицы. */
function makeClient(source: Rows) {
  return {
    from(table: string) {
      const res = source[table] ?? { data: [] }
      const proxy: unknown = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            const p = Promise.resolve({ data: res.data ?? null, error: res.error ?? null })
            return p.then.bind(p)
          }
          return () => proxy
        },
      })
      return proxy
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => makeClient(rows),
}))

vi.mock('@/lib/education/permissions', () => ({
  getUserDepartmentIds: async () => ['dept-his'],
}))

import { hasPrivilege } from './module-privileges'
import type { SessionPayload } from './jwt'

const session = (roles: string[]): SessionPayload =>
  ({ person_id: 'p1', roles, principal: 'staff' } as unknown as SessionPayload)

const ROLE_ROW = { id: 'r1' }

beforeEach(() => { rows = {} })

describe('hasPrivilege', () => {
  it('человек БЕЗ единой должности получает доступ личной выдачей', async () => {
    // Это основная модель владельца: «נותנים לו שם של תפקיד ואז באבטחת מידע
    // מאשרים לו». Ранний выход по пустому session.roles отрезал бы её целиком.
    rows = {
      roles: { data: [] },
      role_privileges: { data: [] },
      person_privileges: { data: [{ privilege_code: 'view', is_granted: true, expires_at: null }] },
    }
    expect(await hasPrivilege(session([]), 'persons', 'view')).toBe(true)
  })

  it('личная выдача поверх должности без прав тоже работает', async () => {
    rows = {
      roles: { data: [ROLE_ROW] },
      role_privileges: { data: [] },
      person_privileges: { data: [{ privilege_code: 'view', is_granted: true, expires_at: null }] },
    }
    expect(await hasPrivilege(session(['unit_manager']), 'persons', 'view')).toBe(true)
  })

  it('личный запрет побеждает право должности', async () => {
    rows = {
      roles: { data: [ROLE_ROW] },
      role_privileges: { data: [{ privilege_code: 'view', scope: 'all' }] },
      person_privileges: { data: [{ privilege_code: 'view', is_granted: false, expires_at: null }] },
    }
    expect(await hasPrivilege(session(['unit_manager']), 'persons', 'view')).toBe(false)
  })

  it('просроченная личная выдача не открывает ничего', async () => {
    rows = {
      roles: { data: [] },
      role_privileges: { data: [] },
      person_privileges: { data: [{ privilege_code: 'view', is_granted: true, expires_at: '2000-01-01T00:00:00Z' }] },
    }
    expect(await hasPrivilege(session([]), 'persons', 'view')).toBe(false)
  })

  it('чужая привилегия того же модуля не подходит', async () => {
    rows = {
      roles: { data: [] },
      role_privileges: { data: [] },
      person_privileges: { data: [{ privilege_code: 'edit', is_granted: true, expires_at: null }] },
    }
    expect(await hasPrivilege(session([]), 'persons', 'view')).toBe(false)
  })

  it('право должности продолжает работать само по себе', async () => {
    rows = {
      roles: { data: [ROLE_ROW] },
      role_privileges: { data: [{ privilege_code: 'view', scope: 'all' }] },
      person_privileges: { data: [] },
    }
    expect(await hasPrivilege(session(['unit_manager']), 'persons', 'view')).toBe(true)
  })

  it('superadmin проходит без единой строки в обеих таблицах', async () => {
    rows = { roles: { data: [] }, role_privileges: { data: [] }, person_privileges: { data: [] } }
    expect(await hasPrivilege(session(['superadmin']), 'persons', 'view')).toBe(true)
  })

  it('без сессии — отказ', async () => {
    expect(await hasPrivilege(null, 'persons', 'view')).toBe(false)
  })
})
