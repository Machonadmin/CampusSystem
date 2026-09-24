import { describe, it, expect, vi, beforeEach } from 'vitest'

// VAPID-ключи должны генерироваться ровно один раз: их смена молча отключает
// пуши на всех уже подписанных устройствах. Проверяем на заглушке app_settings.

let stored: unknown = undefined          // undefined — строки нет
let readError: unknown = null
const writes: Array<{ value: unknown; ignoreDuplicates?: boolean }> = []

function client() {
  return {
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => readError
          ? { data: null, error: readError }
          : { data: stored === undefined ? null : { value: stored }, error: null },
        upsert: async (row: { value: unknown }, opts: { ignoreDuplicates?: boolean }) => {
          writes.push({ value: row.value, ignoreDuplicates: opts.ignoreDuplicates })
          if (stored === undefined || !opts.ignoreDuplicates) stored = row.value
          return { error: null }
        },
      }
      return q
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createServerClient: () => client() }))
vi.mock('@/lib/settings/app-settings', () => ({ getAppSetting: async () => [], setAppSetting: async () => {} }))

async function freshModule() {
  vi.resetModules()
  return import('./webpush')
}

beforeEach(() => {
  stored = undefined
  readError = null
  writes.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('getVapidKeys', () => {
  it('ключи уже есть — возвращает их и ничего не пишет', async () => {
    stored = { publicKey: 'PUB', privateKey: 'PRIV' }
    const { getVapidKeys } = await freshModule()
    expect(await getVapidKeys()).toEqual({ publicKey: 'PUB', privateKey: 'PRIV' })
    expect(writes).toHaveLength(0)
  })

  it('ошибка чтения — НЕ перегенерирует ключи (раньше затирал их новыми)', async () => {
    stored = { publicKey: 'PUB', privateKey: 'PRIV' }
    readError = { code: '08006', message: 'connection failure' }
    const { getVapidKeys } = await freshModule()
    expect(await getVapidKeys()).toBeNull()
    expect(writes).toHaveLength(0)
    expect(stored).toEqual({ publicKey: 'PUB', privateKey: 'PRIV' })
  })

  it('ключей нет — генерирует, вставляет «только если нет» и отдаёт сохранённое', async () => {
    const { getVapidKeys } = await freshModule()
    const keys = await getVapidKeys()
    expect(keys?.publicKey).toBeTruthy()
    expect(writes).toHaveLength(1)
    expect(writes[0].ignoreDuplicates).toBe(true)
    expect(keys).toEqual(stored)
  })

  it('параллельный инстанс успел записать свои ключи — используем их, а не свои', async () => {
    const { getVapidKeys } = await freshModule()
    // Между нашим чтением и записью другой инстанс вставил ключи.
    let firstRead = true
    const winner = { publicKey: 'WIN_PUB', privateKey: 'WIN_PRIV' }
    const mod = await import('@/lib/supabase/server')
    vi.spyOn(mod, 'createServerClient').mockImplementation(() => {
      const c = client()
      return {
        from: () => {
          const q = c.from()
          const maybeSingle = q.maybeSingle
          q.maybeSingle = async () => {
            if (firstRead) { firstRead = false; const r = await maybeSingle(); stored = winner; return r }
            return maybeSingle()
          }
          return q
        },
      } as never
    })
    expect(await getVapidKeys()).toEqual(winner)
    expect(stored).toEqual(winner)
  })
})
