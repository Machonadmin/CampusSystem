import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionPayload } from './jwt'

// Заглушка Supabase: from(table) → цепочка любых методов, thenable. Ответ
// задаётся функцией по таблице и выбранным колонкам.
type Resp = { data: unknown; error: unknown }
type Handler = (table: string, cols: string, filters: Record<string, unknown>) => Resp

const { clientRef } = vi.hoisted(() => ({ clientRef: { handler: null as unknown as Handler } }))

function chain(table: string): unknown {
  let cols = ''
  const filters: Record<string, unknown> = {}
  const proxy: unknown = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') {
        const p = Promise.resolve(clientRef.handler(table, cols, filters))
        return p.then.bind(p)
      }
      return (...args: unknown[]) => {
        if (prop === 'select') cols = String(args[0] ?? '')
        if (prop === 'eq' || prop === 'in') filters[String(args[0])] = args[1]
        return proxy
      }
    },
  })
  return proxy
}

vi.mock('@/lib/supabase/server', () => ({ createServerClient: () => ({ from: (t: string) => chain(t) }) }))

import { checkLiveSession, clearLiveSessionCache, issuedAfter } from './live-session'

const NOW_S = Math.floor(Date.now() / 1000)

const staff = (over: Partial<SessionPayload> = {}): SessionPayload => ({
  person_id: 'p1', login_email: 'a@x', full_name: 'A', roles: ['superadmin'], principal: 'staff', iat: NOW_S, ...over,
})

/** База: аккаунт p1 и его роли. */
function db(opts: {
  account?: Record<string, unknown> | null
  roles?: string[]
  missingColumn?: boolean
  fail?: boolean
  cred?: Record<string, unknown> | null
  journeyStatus?: string
  viewer?: Record<string, unknown> | null
  viewerRoles?: string[]
}): Handler {
  return (table, cols, filters) => {
    if (opts.fail) return { data: null, error: { code: 'XX000', message: 'boom' } }
    if (opts.missingColumn && cols.includes('sessions_valid_after')) {
      return { data: null, error: { code: 'PGRST204', message: 'no column' } }
    }
    if (table === 'person_accounts') {
      if (filters.person_id === 'admin') return { data: opts.viewer ?? null, error: null }
      return { data: opts.account === undefined ? { is_active: true } : opts.account, error: null }
    }
    if (table === 'person_roles') {
      const codes = filters.person_id === 'admin' ? (opts.viewerRoles ?? []) : (opts.roles ?? [])
      return { data: codes.map(c => ({ role_id: `${filters.person_id}:${c}` })), error: null }
    }
    if (table === 'roles') {
      const ids = (filters.id ?? []) as string[]
      return { data: ids.map(id => ({ code: id.split(':')[1] })), error: null }
    }
    if (table === 'student_credentials') return { data: opts.cred ?? null, error: null }
    if (table === 'education_journeys') return { data: { education_status: opts.journeyStatus ?? 'student' }, error: null }
    return { data: null, error: null }
  }
}

beforeEach(() => {
  clearLiveSessionCache()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('issuedAfter', () => {
  it('нет отметки → токен действителен', () => {
    expect(issuedAfter(100, null)).toBe(true)
    expect(issuedAfter(undefined, undefined)).toBe(true)
  })

  it('токен до отметки → недействителен, в ту же секунду и позже → действителен', () => {
    const mark = new Date(2_000_000_500).toISOString() // 2 000 000.5 c
    expect(issuedAfter(1_999_999, mark)).toBe(false)
    expect(issuedAfter(2_000_000, mark)).toBe(true)
    expect(issuedAfter(2_000_001, mark)).toBe(true)
  })
})

describe('checkLiveSession — сотрудник', () => {
  it('активный аккаунт → сессия с ТЕКУЩИМИ ролями из базы', async () => {
    clientRef.handler = db({ roles: ['teacher'] })
    const s = await checkLiveSession(staff())
    expect(s?.roles).toEqual(['teacher'])
  })

  it('аккаунт отключён → null', async () => {
    clientRef.handler = db({ account: { is_active: false } })
    expect(await checkLiveSession(staff())).toBeNull()
  })

  it('аккаунта с этим e-mail больше нет → null', async () => {
    clientRef.handler = db({ account: null })
    expect(await checkLiveSession(staff())).toBeNull()
  })

  it('пароль сменили после выдачи токена → null', async () => {
    clientRef.handler = db({ account: { is_active: true, sessions_valid_after: new Date((NOW_S + 60) * 1000).toISOString() } })
    expect(await checkLiveSession(staff())).toBeNull()
  })

  it('до миграции (нет колонки) → проверяется только is_active', async () => {
    clientRef.handler = db({ missingColumn: true, roles: ['teacher'] })
    expect((await checkLiveSession(staff()))?.roles).toEqual(['teacher'])
  })

  it('сбой базы → токен принимается как есть (fail-open), сбой не кэшируется', async () => {
    clientRef.handler = db({ fail: true })
    const s = staff()
    expect(await checkLiveSession(s)).toBe(s)
    clientRef.handler = db({ account: { is_active: false } })
    expect(await checkLiveSession(s)).toBeNull()
  })
})

describe('checkLiveSession — студентка', () => {
  const student = (): SessionPayload => ({
    person_id: 'p1', login_email: 's@x', full_name: 'S', roles: [], principal: 'student', student_journey_id: 'j1', iat: NOW_S,
  })

  it('активная учётка и journey в статусе student → сессия', async () => {
    clientRef.handler = db({ cred: { person_id: 'p1', is_active: true } })
    expect((await checkLiveSession(student()))?.roles).toEqual([])
  })

  it('учётка отключена → null', async () => {
    clientRef.handler = db({ cred: { person_id: 'p1', is_active: false } })
    expect(await checkLiveSession(student())).toBeNull()
  })

  it('journey больше не student (выпуск/отчисление) → null', async () => {
    clientRef.handler = db({ cred: { person_id: 'p1', is_active: true }, journeyStatus: 'graduated' })
    expect(await checkLiveSession(student())).toBeNull()
  })
})

describe('checkLiveSession — режим «צפייה כמשתמש»', () => {
  const imp = () => staff({ roles: ['teacher'], imp_by: 'admin', imp_by_name: 'Admin' })

  it('смотрящий — активный superadmin → сессия с текущими ролями цели', async () => {
    clientRef.handler = db({ viewer: { is_active: true }, viewerRoles: ['superadmin'], roles: ['studies_secretary'] })
    expect((await checkLiveSession(imp()))?.roles).toEqual(['studies_secretary'])
  })

  it('у смотрящего сняли superadmin → null', async () => {
    clientRef.handler = db({ viewer: { is_active: true }, viewerRoles: ['teacher'] })
    expect(await checkLiveSession(imp())).toBeNull()
  })

  it('аккаунт смотрящего отключён → null', async () => {
    clientRef.handler = db({ viewer: { is_active: false }, viewerRoles: ['superadmin'] })
    expect(await checkLiveSession(imp())).toBeNull()
  })
})
