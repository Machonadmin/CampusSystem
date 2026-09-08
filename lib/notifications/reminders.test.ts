import { describe, it, expect } from 'vitest'
import { materializeAllDueReminders } from './reminders'

// Созревшие напоминания рассылаются ОДНОЙ пачкой (раньше — 2 запроса на каждое
// событие, до 2000 за прогон cron). Но пачка неделима, поэтому одна сбойная
// строка не должна блокировать все напоминания: тогда включается построчный
// запасной путь. Эти два режима и проверяем на заглушке клиента.

type Row = { id: string; title: string; link: string | null; owner_id: string }

interface Call { table: string; methods: string[]; args: unknown[][] }

/**
 * Заглушка Supabase. `notifyError(rows)` решает судьбу конкретной вставки в
 * notifications: null — успех, объект — ошибка (rows = переданные строки).
 */
function makeClient(due: Row[], notifyError: (rows: unknown[]) => unknown) {
  const calls: Call[] = []
  function chain(table: string): unknown {
    const rec: Call = { table, methods: [], args: [] }
    calls.push(rec)
    const proxy: unknown = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          let res: { data: unknown; error: unknown } = { data: null, error: null }
          if (table === 'calendar_events' && rec.methods.includes('select')) res = { data: due, error: null }
          if (table === 'notifications' && rec.methods.includes('insert')) {
            const rows = rec.args[rec.methods.indexOf('insert')] as unknown[]
            res = { data: null, error: notifyError(Array.isArray(rows[0]) ? rows[0] as unknown[] : [rows[0]]) }
          }
          const p = Promise.resolve(res)
          return p.then.bind(p)
        }
        return (...args: unknown[]) => { rec.methods.push(prop); rec.args.push(args); return proxy }
      },
    })
    return proxy
  }
  return { client: { from: (t: string) => chain(t) }, calls }
}

const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `e${i}`, title: `Event ${i}`, link: null, owner_id: `p${i}` }))

const inserts = (calls: Call[]) => calls.filter(c => c.table === 'notifications' && c.methods.includes('insert'))
const updates = (calls: Call[]) => calls.filter(c => c.table === 'calendar_events' && c.methods.includes('update'))

describe('materializeAllDueReminders', () => {
  it('успешный случай: ОДНА пачка вставок и ОДИН update, независимо от числа событий', async () => {
    const { client, calls } = makeClient(rows(50), () => null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created = await materializeAllDueReminders(client as any)
    expect(created).toBe(50)
    expect(inserts(calls)).toHaveLength(1)          // не 50
    expect(updates(calls)).toHaveLength(1)          // не 50
    expect(updates(calls)[0].methods).toContain('in')  // помечаем все id разом
  })

  it('нет созревших событий — ничего не пишем', async () => {
    const { client, calls } = makeClient([], () => null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await materializeAllDueReminders(client as any)).toBe(0)
    expect(inserts(calls)).toHaveLength(0)
  })

  it('одна плохая строка не блокирует остальные: откат на построчную вставку', async () => {
    // Пачка падает; при построчной вставке падает только owner p2.
    const notifyError = (rs: unknown[]) => {
      if (rs.length > 1) return { code: '23503', message: 'batch fails' }
      const r = rs[0] as { person_id?: string }
      return r?.person_id === 'p2' ? { code: '23503', message: 'bad owner' } : null
    }
    const { client, calls } = makeClient(rows(4), notifyError)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created = await materializeAllDueReminders(client as any)
    expect(created).toBe(3)                          // 4 событий − 1 сбойное
    expect(inserts(calls).length).toBe(1 + 4)        // пачка + 4 построчных
    // Помечаем сработавшими ТОЛЬКО успешные события (по одному .eq на каждое).
    expect(updates(calls)).toHaveLength(3)
    for (const u of updates(calls)) expect(u.methods).toContain('eq')
  })

  it('таблицы notifications ещё нет — тихо выходим, без падения и без пометок', async () => {
    const { client, calls } = makeClient(rows(3), () => ({ code: 'PGRST205', message: 'no table' }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await materializeAllDueReminders(client as any)).toBe(0)
    expect(updates(calls)).toHaveLength(0)           // ничего не помечено сработавшим
  })

  it('события помечаются сработавшими только ПОСЛЕ успешной вставки уведомлений', async () => {
    const { client, calls } = makeClient(rows(2), () => null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await materializeAllDueReminders(client as any)
    const order = calls.filter(c =>
      (c.table === 'notifications' && c.methods.includes('insert')) ||
      (c.table === 'calendar_events' && c.methods.includes('update')))
    expect(order[0].table).toBe('notifications')
    expect(order[1].table).toBe('calendar_events')
  })
})
