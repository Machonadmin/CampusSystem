import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SessionPayload } from './jwt'

// ─── Workstream 2a: «нет привилегии → 403» на уровне гейтов ──────────────────
//
// Каждый endpoint защищён одним из require*-гейтов. Здесь проверяем сам гейт:
// сессия БЕЗ привилегий получает 403 (а без сессии — 401) для выборки модулей,
// и — контроль от «сломано-закрыто» — superadmin проходит. БД замокана пустым
// результатом, поэтому у обычной сессии привилегий не находится.

// getSession мокаем через hoisted-ссылку (vi.mock поднимается выше импортов).
const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ getSession: getSessionMock }))

// Любой запрос к Supabase → { data: [], error: null } (нет ролей/привилегий).
// Прокси возвращает сам себя на любой метод (чейнинг) и «тенабелен» на await.
function emptyQuery(): unknown {
  const p = Promise.resolve({ data: [], error: null })
  const proxy: unknown = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return p.then.bind(p)
      if (prop === 'catch') return p.catch.bind(p)
      if (prop === 'finally') return p.finally.bind(p)
      return () => proxy
    },
  })
  return proxy
}
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    from: () => emptyQuery(),
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}))

import { requirePrivilege, hasPrivilege } from './module-privileges'
import { requireEducationPrivilege, hasEducationPrivilege } from '@/lib/education/permissions'

const noPriv = (over: Partial<SessionPayload> = {}): SessionPayload => ({
  person_id: 'u-noPriv', login_email: 'x@test', full_name: 'No Priv',
  roles: [], principal: 'staff', ...over,
}) as SessionPayload

const superadmin = (): SessionPayload => ({
  person_id: 'u-sa', login_email: 'sa@test', full_name: 'Super',
  roles: ['superadmin'], principal: 'staff',
}) as SessionPayload

beforeEach(() => getSessionMock.mockReset())

describe('requirePrivilege — нет сессии → 401', () => {
  it('бросает 401', async () => {
    getSessionMock.mockResolvedValue(null)
    await expect(requirePrivilege('persons', 'view')).rejects.toMatchObject({ status: 401 })
  })
})

describe('requirePrivilege — сессия без привилегий → 403 (выборка модулей)', () => {
  const modules: string[] = ['persons', 'documents', 'finance', 'security', 'dormitory']
  for (const m of modules) {
    it(`${m}: staff без ролей → 403`, async () => {
      getSessionMock.mockResolvedValue(noPriv())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(requirePrivilege(m as any, 'view')).rejects.toMatchObject({ status: 403 })
    })
  }
})

describe('requireEducationPrivilege — без прав → 403; superadmin → проходит', () => {
  it('staff без ролей → 403', async () => {
    getSessionMock.mockResolvedValue(noPriv())
    await expect(requireEducationPrivilege('manage_leads')).rejects.toMatchObject({ status: 403 })
  })
  it('нет сессии → 401', async () => {
    getSessionMock.mockResolvedValue(null)
    await expect(requireEducationPrivilege('view_students')).rejects.toMatchObject({ status: 401 })
  })
  it('КОНТРОЛЬ: superadmin проходит (гейт не «сломано-закрыт»)', async () => {
    getSessionMock.mockResolvedValue(superadmin())
    await expect(requireEducationPrivilege('manage_leads')).resolves.toMatchObject({ person_id: 'u-sa' })
  })
})

describe('hasPrivilege / hasEducationPrivilege — чистые отказы', () => {
  it('нет сессии → false', async () => {
    expect(await hasPrivilege(null, 'persons', 'view')).toBe(false)
  })
  it('staff без ролей → false (без обращения к БД)', async () => {
    expect(await hasPrivilege(noPriv(), 'persons', 'view')).toBe(false)
    expect(await hasEducationPrivilege(noPriv(), 'manage_leads')).toBe(false)
  })
  it('superadmin (не student) → education-доступ true', async () => {
    expect(await hasEducationPrivilege(superadmin(), 'manage_leads')).toBe(true)
  })
})
