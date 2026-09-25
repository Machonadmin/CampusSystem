import { describe, it, expect, vi, beforeEach } from 'vitest'

// Правило «запросить скидку на обучение»: только секретариат учёбы юнита
// студентки (роль studies_secretary + посадка в юните или выше) или superadmin;
// портальный токен студентки — никогда.

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

import { canRequestTuitionDiscount } from './discount-request-access'
import { clearPermissionsCache } from '@/lib/education/permissions'
import type { SessionPayload } from '@/lib/auth/jwt'

const INSTITUTE = 'dept-institute'
const COLLEGE = 'dept-college'
const OTHER = 'dept-other'
const TREE = [
  { id: INSTITUTE, parent_id: null },
  { id: COLLEGE, parent_id: INSTITUTE },
  { id: OTHER, parent_id: null },
]

const session = (roles: string[], principal = 'staff'): SessionPayload =>
  ({ person_id: 'p1', roles, principal } as unknown as SessionPayload)

const seatedIn = (dept: string): Rows => ({
  staff_positions: { data: [{ department_id: dept, end_date: null }] },
  departments: { data: TREE },
})

beforeEach(() => {
  clearPermissionsCache()
  rows = {}
})

describe('canRequestTuitionDiscount', () => {
  it('секретарь, посаженный в юнит студентки — да', async () => {
    rows = seatedIn(COLLEGE)
    expect(await canRequestTuitionDiscount(session(['studies_secretary']), COLLEGE)).toBe(true)
  })

  it('секретарь, посаженный в юнит-предок — да', async () => {
    rows = seatedIn(INSTITUTE)
    expect(await canRequestTuitionDiscount(session(['studies_secretary']), COLLEGE)).toBe(true)
  })

  it('секретарь другого юнита — нет', async () => {
    rows = seatedIn(OTHER)
    expect(await canRequestTuitionDiscount(session(['studies_secretary']), COLLEGE)).toBe(false)
  })

  it('посадка в юните без роли studies_secretary (учитель, финансы) — нет', async () => {
    rows = seatedIn(COLLEGE)
    expect(await canRequestTuitionDiscount(session(['teacher']), COLLEGE)).toBe(false)
    expect(await canRequestTuitionDiscount(session(['accountant']), COLLEGE)).toBe(false)
  })

  it('journey без подразделения — нет (кроме superadmin)', async () => {
    rows = seatedIn(COLLEGE)
    expect(await canRequestTuitionDiscount(session(['studies_secretary']), null)).toBe(false)
    expect(await canRequestTuitionDiscount(session(['superadmin']), null)).toBe(true)
  })

  it('superadmin — да', async () => {
    expect(await canRequestTuitionDiscount(session(['superadmin']), COLLEGE)).toBe(true)
  })

  it('портальный токен студентки — никогда, даже с ролями/посадкой', async () => {
    rows = seatedIn(COLLEGE)
    expect(await canRequestTuitionDiscount(session(['studies_secretary'], 'student'), COLLEGE)).toBe(false)
    expect(await canRequestTuitionDiscount(session(['superadmin'], 'student'), COLLEGE)).toBe(false)
  })

  it('нет сессии — нет', async () => {
    expect(await canRequestTuitionDiscount(null, COLLEGE)).toBe(false)
  })
})
