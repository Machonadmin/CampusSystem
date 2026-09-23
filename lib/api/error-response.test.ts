import { describe, it, expect, vi, afterEach } from 'vitest'
import { errorResponse } from './handler'

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('errorResponse', () => {
  it('4xx — текст ошибки отдаётся как есть', async () => {
    const res = errorResponse({ status: 403, message: 'אין הרשאה' })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('אין הרשאה')
  })

  it('5xx в проде — сырой текст БД клиенту не уходит, только в лог', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = errorResponse({ message: 'relation "person_accounts" violates constraint "x_fkey"' })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('internal_error')
    expect(JSON.stringify(body)).not.toContain('person_accounts')
    expect(log).toHaveBeenCalled()
  })
})
