import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Wiring test: the role-admin routes really refuse reserved codes ─────────
//
// lib/auth/reserved-roles.test.ts proves the decision function; this file proves
// the two routes CALL it, before touching the database:
//   POST  /api/settings/roles       — create
//   PATCH /api/settings/roles/[id]  — rename
// Session and Supabase are mocked; the Supabase stub records every call so we
// can assert that a refused request never reaches insert()/update().

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ getSession: getSessionMock }))

// Programmable chainable query stub. `from(table)` returns a proxy that records
// the chain (method names + args); awaiting it resolves via `resolver(chain)`.
type Call = { method: string; args: unknown[] }
type Chain = { table: string; calls: Call[] }
const state = vi.hoisted(() => ({
  chains: [] as Chain[],
  resolver: ((_c: Chain) => ({ data: null, error: null })) as (c: Chain) => { data: unknown; error: unknown },
}))

function makeChain(table: string): unknown {
  const chain: Chain = { table, calls: [] }
  state.chains.push(chain)
  const proxy: unknown = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') {
        const p = Promise.resolve(state.resolver(chain))
        return p.then.bind(p)
      }
      return (...args: unknown[]) => { chain.calls.push({ method: prop, args }); return proxy }
    },
  })
  return proxy
}
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ from: (table: string) => makeChain(table) }),
}))

import { POST } from '@/app/api/settings/roles/route'
import { PATCH } from '@/app/api/settings/roles/[id]/route'

const superadmin = () => ({
  person_id: 'u-sa', login_email: 'sa@test', full_name: 'Super', roles: ['superadmin'], principal: 'staff',
})

const methods = (c: Chain) => c.calls.map(x => x.method)
const chainsWith = (m: string) => state.chains.filter(c => methods(c).includes(m))

function post(body: unknown) {
  return POST(new NextRequest('http://localhost/api/settings/roles', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))
}
function patch(id: string, body: unknown) {
  return PATCH(new NextRequest(`http://localhost/api/settings/roles/${id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), { params: { id } })
}

beforeEach(() => {
  getSessionMock.mockReset()
  getSessionMock.mockResolvedValue(superadmin())
  state.chains = []
  state.resolver = () => ({ data: null, error: null })
})

describe('POST /api/settings/roles — reserved codes', () => {
  it('refuses to create a role with a reserved code (409, i18n code, nothing inserted)', async () => {
    const res = await post({ name: 'Boss', code: 'superadmin', category: 'custom' })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('role_code_reserved')
    expect(body.reserved_code).toBe('superadmin')
    expect(typeof body.error).toBe('string')
    expect(body.error).not.toBe('role_code_reserved') // translated, not the raw key
    expect(chainsWith('insert')).toHaveLength(0)
  })

  it('normalises before checking — " Campus_Admin " is refused too', async () => {
    const res = await post({ name: 'X', code: ' Campus_Admin ', category: 'custom' })
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('role_code_reserved')
    expect(chainsWith('insert')).toHaveLength(0)
  })

  it('still refuses "admin" (unseeded but hardcoded in the positions guard)', async () => {
    const res = await post({ name: 'Admin', code: 'admin', category: 'custom' })
    expect(res.status).toBe(409)
    expect(chainsWith('insert')).toHaveLength(0)
  })

  it('creates an ordinary code (insert reached, 201)', async () => {
    state.resolver = c => methods(c).includes('insert')
      ? { data: { id: 'r1', name: 'Librarian', code: 'librarian', category: 'custom', is_system: false }, error: null }
      : { data: null, error: null }
    const res = await post({ name: 'Librarian', code: 'librarian', category: 'custom' })
    expect(res.status).toBe(201)
    expect((await res.json()).code).toBe('librarian')
    expect(chainsWith('insert')).toHaveLength(1)
  })

  it('reserved-code check runs only for a superadmin session (guard first)', async () => {
    getSessionMock.mockResolvedValue({ ...superadmin(), roles: ['teacher'] })
    const res = await post({ name: 'Boss', code: 'superadmin', category: 'custom' })
    expect(res.status).toBe(403)
    expect(chainsWith('insert')).toHaveLength(0)
  })
})

describe('PATCH /api/settings/roles/[id] — rename guard', () => {
  const currentCode = (code: string | null) => {
    state.resolver = c => methods(c).includes('select') && methods(c).includes('maybeSingle')
      ? { data: code === null ? null : { code }, error: null }
      : { data: null, error: null }
  }

  it('refuses to rename an ordinary role TO a reserved code (409, nothing updated)', async () => {
    currentCode('librarian')
    const res = await patch('r1', { code: 'superadmin' })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('role_code_reserved')
    expect(body.reserved_code).toBe('superadmin')
    expect(chainsWith('update')).toHaveLength(0)
  })

  it('refuses to rename a reserved role AWAY from its code (409 role_code_locked, nothing updated)', async () => {
    currentCode('superadmin')
    const res = await patch('r-sa', { code: 'boss' })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('role_code_locked')
    expect(body.reserved_code).toBe('superadmin')
    expect(chainsWith('update')).toHaveLength(0)
  })

  it('allows a no-op resend of the same reserved code (the roles screen may send the whole form)', async () => {
    currentCode('superadmin')
    const res = await patch('r-sa', { code: 'superadmin', name: 'Super administrator' })
    expect(res.status).toBe(200)
    expect(chainsWith('update')).toHaveLength(1)
  })

  it('allows editing name/description of a reserved role when code is not in the body', async () => {
    const res = await patch('r-sa', { name: 'Super administrator' })
    expect(res.status).toBe(200)
    // No need to read the current row when the code is untouched.
    expect(chainsWith('maybeSingle')).toHaveLength(0)
    expect(chainsWith('update')).toHaveLength(1)
  })

  it('allows renaming between two ordinary codes', async () => {
    currentCode('librarian')
    const res = await patch('r1', { code: 'archivist' })
    expect(res.status).toBe(200)
    expect(chainsWith('update')).toHaveLength(1)
  })

  it('fail-closed: unknown role id with a code change → 404, nothing updated', async () => {
    currentCode(null)
    const res = await patch('nope', { code: 'archivist' })
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('role_not_found')
    expect(chainsWith('update')).toHaveLength(0)
  })

  it('fail-closed: if the current row cannot be read, nothing is updated (500)', async () => {
    state.resolver = c => methods(c).includes('maybeSingle')
      ? { data: null, error: { message: 'db down' } }
      : { data: null, error: null }
    const res = await patch('r1', { code: 'archivist' })
    expect(res.status).toBe(500)
    expect(chainsWith('update')).toHaveLength(0)
  })

  it('non-superadmin cannot rename at all (403)', async () => {
    getSessionMock.mockResolvedValue({ ...superadmin(), roles: ['teacher'] })
    const res = await patch('r1', { code: 'archivist' })
    expect(res.status).toBe(403)
    expect(chainsWith('update')).toHaveLength(0)
  })
})
