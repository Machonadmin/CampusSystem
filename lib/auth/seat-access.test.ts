import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Контракт: одно правило посадки, и оно ОБЪЕДИНЕНИЕ ───────────────────────
//
// «Посадить человека в единицу» умели четыре маршрута с четырьмя разными
// ответами на вопрос «кому можно». Сведение их к одному правилу опасно ровно
// одним способом: если правило окажется ЗАМЕНОЙ, глава единицы, который сажает
// людей сегодня, завтра получит 403 — и никто этого не заметит, пока он не
// придёт жаловаться.
//
// Поэтому проверка поведенческая (подменяется Supabase, спрашивается ответ), и
// каждая из трёх дорог внутрь проверяется отдельно: superadmin, право
// data_security.manage_units, глава именно этой единицы. Плюс отказ всем
// остальным — без него тест проходил бы и на `return true`.

type Rows = Record<string, { data?: unknown[]; error?: unknown }>

let rows: Rows = {}

/** Заглушка Supabase: один ответ на любую цепочку вызовов таблицы. */
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

import { canSeatInUnit } from './seat-access'
import { clearDataSecurityPermissionsCache } from '@/lib/data-security/permissions'
import type { SessionPayload } from './jwt'

const UNIT = 'dept-college'
const OTHER = 'dept-kitchen'

const session = (roles: string[], principal = 'staff'): SessionPayload =>
  ({ person_id: 'p1', roles, principal } as unknown as SessionPayload)

/** Ни прав, ни должностей — чистый лист. */
const NOTHING: Rows = {
  roles: { data: [] },
  role_privileges: { data: [] },
  person_privileges: { data: [] },
  staff_positions: { data: [] },
}

beforeEach(() => {
  rows = { ...NOTHING }
  // Права модуля кэшируются на 30 секунд по person_id — между тестами кэш
  // обязан быть пуст, иначе они начнут подсказывать друг другу ответы.
  clearDataSecurityPermissionsCache()
})

describe('canSeatInUnit', () => {
  it('superadmin сажает без единой строки в базе', async () => {
    expect(await canSeatInUnit(session(['superadmin']), UNIT)).toBe(true)
  })

  it('держатель data_security.manage_units сажает', async () => {
    rows = {
      ...NOTHING,
      person_privileges: { data: [{ privilege_code: 'manage_units', is_granted: true, expires_at: null }] },
    }
    expect(await canSeatInUnit(session([]), UNIT)).toBe(true)
  })

  it('глава единицы продолжает сажать у себя — правило объединяет, а не заменяет', async () => {
    rows = {
      ...NOTHING,
      staff_positions: { data: [{ department_id: UNIT, is_head: true, end_date: null }] },
    }
    expect(await canSeatInUnit(session([]), UNIT)).toBe(true)
  })

  it('глава чужой единицы к этой не допускается', async () => {
    rows = {
      ...NOTHING,
      staff_positions: { data: [{ department_id: OTHER, is_head: true, end_date: null }] },
    }
    expect(await canSeatInUnit(session([]), UNIT)).toBe(false)
  })

  it('закрытая должность главой больше не делает', async () => {
    rows = {
      ...NOTHING,
      staff_positions: { data: [{ department_id: UNIT, is_head: true, end_date: '2000-01-01' }] },
    }
    expect(await canSeatInUnit(session([]), UNIT)).toBe(false)
  })

  it('просроченная выдача manage_units не сажает', async () => {
    rows = {
      ...NOTHING,
      person_privileges: { data: [{ privilege_code: 'manage_units', is_granted: true, expires_at: '2000-01-01T00:00:00Z' }] },
    }
    expect(await canSeatInUnit(session([]), UNIT)).toBe(false)
  })

  it('личный запрет manage_units побеждает', async () => {
    rows = {
      ...NOTHING,
      person_privileges: { data: [{ privilege_code: 'manage_units', is_granted: false, expires_at: null }] },
    }
    expect(await canSeatInUnit(session([]), UNIT)).toBe(false)
  })

  it('соседнее право модуля не сажает', async () => {
    rows = {
      ...NOTHING,
      person_privileges: { data: [{ privilege_code: 'manage_tree', is_granted: true, expires_at: null }] },
    }
    expect(await canSeatInUnit(session([]), UNIT)).toBe(false)
  })

  it('посторонний получает отказ', async () => {
    expect(await canSeatInUnit(session(['teacher']), UNIT)).toBe(false)
  })

  it('токен студентки не сажает, даже если тот же person где-то глава', async () => {
    rows = {
      ...NOTHING,
      staff_positions: { data: [{ department_id: UNIT, is_head: true, end_date: null }] },
    }
    expect(await canSeatInUnit(session(['superadmin'], 'student'), UNIT)).toBe(false)
  })

  it('без сессии — отказ', async () => {
    expect(await canSeatInUnit(null, UNIT)).toBe(false)
  })

  it('без единицы правом главы не пройти (а manage_units — да)', async () => {
    rows = {
      ...NOTHING,
      staff_positions: { data: [{ department_id: UNIT, is_head: true, end_date: null }] },
    }
    expect(await canSeatInUnit(session([]), null)).toBe(false)
  })
})
