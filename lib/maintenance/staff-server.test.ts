import { describe, it, expect } from 'vitest'
import { maintenanceStaffPersonIds } from './staff-server'

/**
 * «Кто такой человек из техслужбы» — самая хрупкая точка связки задач и
 * эксплуатации. Первая версия смотрела ТОЛЬКО на два кода ролей из сида, и
 * реальная настройка владельца (своя роль «מנהל תחזוקה») в неё не попала:
 * галочки не было, задача до доски не доходила. Тесты фиксируют новый, более
 * широкий признак и его границы.
 */

type Rows = Record<string, { data?: unknown[]; error?: unknown }>

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

const ids = (s: Set<string> | null) => (s === null ? null : [...s].sort())

describe('maintenanceStaffPersonIds', () => {
  it('носители сидовых ролей техслужбы считаются', async () => {
    const sb = makeClient({
      roles: { data: [{ id: 'r-seed' }] },
      role_privileges: { data: [] },
      person_roles: { data: [{ person_id: 'p1' }, { person_id: 'p2' }] },
      person_privileges: { data: [] },
    })
    expect(ids(await maintenanceStaffPersonIds(sb))).toEqual(['p1', 'p2'])
  })

  it('СОБСТВЕННАЯ роль владельца с правом maintenance.manage тоже считается', async () => {
    // Ровно тот случай, на котором связка не сработала: роль называется как
    // угодно, кода в сиде нет, но в настройках ей выдано управление модулем.
    const sb = makeClient({
      roles: { data: [] },                                  // сидовых ролей нет вовсе
      role_privileges: { data: [{ role_id: 'r-custom' }] },  // своя роль с 'manage'
      person_roles: { data: [{ person_id: 'p-custom' }] },
      person_privileges: { data: [] },
    })
    expect(ids(await maintenanceStaffPersonIds(sb))).toEqual(['p-custom'])
  })

  it('персональная выдача maintenance.manage делает человеком из техслужбы без роли', async () => {
    const sb = makeClient({
      roles: { data: [] },
      role_privileges: { data: [] },
      person_roles: { data: [] },
      person_privileges: { data: [{ person_id: 'p-solo', is_granted: true, expires_at: null }] },
    })
    expect(ids(await maintenanceStaffPersonIds(sb))).toEqual(['p-solo'])
  })

  it('персональный запрет снимает признак, выданный ролью', async () => {
    const sb = makeClient({
      roles: { data: [{ id: 'r-seed' }] },
      role_privileges: { data: [] },
      person_roles: { data: [{ person_id: 'p1' }, { person_id: 'p2' }] },
      person_privileges: { data: [{ person_id: 'p2', is_granted: false, expires_at: null }] },
    })
    expect(ids(await maintenanceStaffPersonIds(sb))).toEqual(['p1'])
  })

  it('просроченная персональная выдача игнорируется', async () => {
    const sb = makeClient({
      roles: { data: [] },
      role_privileges: { data: [] },
      person_roles: { data: [] },
      person_privileges: { data: [{ person_id: 'p-old', is_granted: true, expires_at: '2000-01-01T00:00:00Z' }] },
    })
    expect(ids(await maintenanceStaffPersonIds(sb))).toEqual([])
  })

  it('людей нет — ПУСТОЕ множество, а не null (это ответ «никто», не сбой)', async () => {
    const sb = makeClient({
      roles: { data: [] }, role_privileges: { data: [] },
      person_roles: { data: [] }, person_privileges: { data: [] },
    })
    expect(ids(await maintenanceStaffPersonIds(sb))).toEqual([])
  })

  it('ошибка чтения ролей/прав → null («не знаю»), чтобы метку не стёрли по ошибке', async () => {
    const rolesErr = makeClient({
      roles: { error: { code: '42P01' } }, role_privileges: { data: [] },
      person_roles: { data: [] }, person_privileges: { data: [] },
    })
    expect(await maintenanceStaffPersonIds(rolesErr)).toBeNull()

    const privsErr = makeClient({
      roles: { data: [] }, role_privileges: { error: { code: '42P01' } },
      person_roles: { data: [] }, person_privileges: { data: [] },
    })
    expect(await maintenanceStaffPersonIds(privsErr)).toBeNull()

    const peopleErr = makeClient({
      roles: { data: [{ id: 'r-seed' }] }, role_privileges: { data: [] },
      person_roles: { error: { code: '42P01' } }, person_privileges: { data: [] },
    })
    expect(await maintenanceStaffPersonIds(peopleErr)).toBeNull()
  })

  it('один человек и по роли, и персонально — не дублируется', async () => {
    const sb = makeClient({
      roles: { data: [{ id: 'r-seed' }] },
      role_privileges: { data: [{ role_id: 'r-seed' }] },
      person_roles: { data: [{ person_id: 'p1' }, { person_id: 'p1' }] },
      person_privileges: { data: [{ person_id: 'p1', is_granted: true, expires_at: null }] },
    })
    expect(ids(await maintenanceStaffPersonIds(sb))).toEqual(['p1'])
  })
})
