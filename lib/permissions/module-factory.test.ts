import { describe, it, expect } from 'vitest'
import { makeModulePermissions } from './module-factory'
import type { SessionPayload } from '@/lib/auth/jwt'

/**
 * Проверяем короткозамкнутые ветки фабрики, НЕ обращающиеся к БД:
 *   - нет сессии → нет прав;
 *   - superadmin (не студент) → есть право / scope='all' без запроса к БД;
 *   - каждый модуль получает изолированный кэш.
 * Ветки с загрузкой из БД покрываются интеграционно (здесь без сети).
 */

type P = 'view' | 'manage'
const perms = makeModulePermissions<P>('doctor')

function session(over: Partial<SessionPayload>): SessionPayload {
  return {
    person_id: 'p1',
    full_name: 'Test',
    roles: [],
    principal: 'staff',
    ...over,
  } as SessionPayload
}

describe('makeModulePermissions (DB-free branches)', () => {
  it('no session → no privilege, null scope', async () => {
    expect(await perms.hasPrivilege(null, 'view')).toBe(false)
    expect(await perms.getPrivilegeScope(null, 'view')).toBeNull()
  })

  it('staff superadmin bypasses to granted / scope=all', async () => {
    const s = session({ roles: ['superadmin'] })
    expect(await perms.hasPrivilege(s, 'manage')).toBe(true)
    expect(await perms.getPrivilegeScope(s, 'view')).toBe('all')
  })

  it('each module gets its own isolated cache instance', () => {
    const a = makeModulePermissions<P>('finance')
    const b = makeModulePermissions<P>('finance')
    // Разные объекты — разные замыкания/кэши (изоляция как в прежних файлах).
    expect(a).not.toBe(b)
    expect(typeof a.clearCache).toBe('function')
  })
})
