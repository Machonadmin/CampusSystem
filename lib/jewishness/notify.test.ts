import { describe, it, expect, vi, beforeEach } from 'vitest'

const created: Array<Array<Record<string, unknown>>> = []
vi.mock('@/lib/notifications/create', () => ({
  createNotifications: async (_sb: unknown, rows: Array<Record<string, unknown>>) => { created.push(rows) },
}))

import { finalApproverPersonIds, notifyFinalApprovers } from './notify'

/**
 * «בדיקה ראשונית» рава → уведомление тем, кто даёт финальное утверждение
 * (решение владельца 2026-10-19). Проверяем, КОМУ оно уходит.
 */

type Rows = Record<string, { data?: unknown; error?: unknown }>

/** Заглушка Supabase: отдаёт заранее заданный ответ на КАЖДУЮ таблицу. */
function makeClient(rows: Rows) {
  return {
    from(table: string) {
      const res = rows[table] ?? { data: [] }
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

const sorted = (s: Set<string>) => [...s].sort()

beforeEach(() => { created.length = 0 })

describe('finalApproverPersonIds', () => {
  it('носители роли с правом финального утверждения', async () => {
    const sb = makeClient({
      role_privileges: { data: [{ role_id: 'r-chana' }] },
      person_roles: { data: [{ person_id: 'chana' }] },
      person_privileges: { data: [] },
    })
    expect(sorted(await finalApproverPersonIds(sb))).toEqual(['chana'])
  })

  it('персональная выдача добавляет, запрет и просрочка — нет', async () => {
    const sb = makeClient({
      role_privileges: { data: [{ role_id: 'r-chana' }] },
      person_roles: { data: [{ person_id: 'chana' }, { person_id: 'denied' }] },
      person_privileges: { data: [
        { person_id: 'solo', is_granted: true, expires_at: null },
        { person_id: 'denied', is_granted: false, expires_at: null },
        { person_id: 'old', is_granted: true, expires_at: '2000-01-01T00:00:00Z' },
      ] },
    })
    expect(sorted(await finalApproverPersonIds(sb))).toEqual(['chana', 'solo'])
  })
})

describe('notifyFinalApprovers', () => {
  it('уведомляет с именем ученицы и ссылкой на בירור יהדות', async () => {
    const sb = makeClient({
      role_privileges: { data: [{ role_id: 'r-chana' }] },
      person_roles: { data: [{ person_id: 'chana' }] },
      person_privileges: { data: [] },
      education_journeys: { data: { person: { full_name: 'Авнер Роза', hebrew_name: 'רוזה אבנר' } } },
    })
    await notifyFinalApprovers(sb, { journeyId: 'j1', checkedBy: 'rav' })
    expect(created).toHaveLength(1)
    expect(created[0]).toEqual([expect.objectContaining({
      person_id: 'chana',
      title: 'הרב סיים בדיקה ראשונית של רוזה אבנר, אפשר לתת אישור סופי',
      link: '/dashboard/jewishness',
      metadata: { journey_id: 'j1' },
    })])
  })

  it('себя не уведомляет; если больше некому — ничего не создаёт', async () => {
    const sb = makeClient({
      role_privileges: { data: [{ role_id: 'r' }] },
      person_roles: { data: [{ person_id: 'rav' }] },
      person_privileges: { data: [] },
    })
    await notifyFinalApprovers(sb, { journeyId: 'j1', checkedBy: 'rav' })
    expect(created).toHaveLength(0)
  })

  it('ошибка чтения прав не бросает (статус уже записан)', async () => {
    const sb = makeClient({ role_privileges: { error: { code: 'XX000' } } })
    await expect(notifyFinalApprovers(sb, { journeyId: 'j1', checkedBy: 'rav' })).resolves.toBeUndefined()
    expect(created).toHaveLength(0)
  })
})
