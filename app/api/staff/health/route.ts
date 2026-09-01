import { NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

/**
 * GET /api/staff/health — самопроверка «ניהול עובדים» (запрос владельца:
 * «נמאס לי לבדוק» — система находит проблемы сама, до жалоб сотрудников):
 *
 *   • blank_screen — активный логин, у которого 0 доступных модулей
 *     (роли без access-привилегий или ролей нет; учтены персональные
 *     grant/deny): человек войдёт и увидит «модули не назначены».
 *   • no_seat — активный логин без активной посадки (staff_positions с
 *     end_date IS NULL): пропадает из списка команды, без должности.
 *
 * Superadmin-логины пропускаем (им всё доступно без ролей, посадка не
 * обязательна). Дубли считает существующий /api/persons/duplicates —
 * панель на клиенте зовёт оба эндпоинта. Право: superadmin.
 */

interface HealthPerson { person_id: string; name: string; login_email: string }

export async function GET() {
  const session = await getSession()
  if (!session) return apiError('unauthorized', 401)
  if (!session.roles.includes('superadmin')) return apiError('forbidden', 403)

  try {
    const sb = createServerClient()
    const { data: accounts, error: accErr } = await sb
      .from('person_accounts')
      .select('person_id, login_email')
      .eq('is_active', true)
    if (accErr) throw accErr
    const accs = (accounts ?? []) as { person_id: string; login_email: string }[]
    if (accs.length === 0) return NextResponse.json({ blank_screen: [], no_seat: [] })
    const ids = accs.map(a => a.person_id)

    const [personsRes, prRes, seatsRes, ppRes] = await Promise.all([
      sb.from('persons').select('id, first_name, last_name, middle_name, hebrew_name').in('id', ids),
      sb.from('person_roles').select('person_id, role_id').in('person_id', ids),
      sb.from('staff_positions').select('person_id').in('person_id', ids).is('end_date', null),
      sb.from('person_privileges').select('person_id, module, is_granted, expires_at')
        .eq('privilege_code', 'access').in('person_id', ids),
    ])

    const personRoles = (prRes.data ?? []) as { person_id: string; role_id: string }[]
    const roleIds = [...new Set(personRoles.map(r => r.role_id))]
    let roleCodes = new Map<string, string>()
    let roleModules = new Map<string, Set<string>>()
    if (roleIds.length > 0) {
      const [rolesRes, rpRes] = await Promise.all([
        sb.from('roles').select('id, code').in('id', roleIds),
        sb.from('role_privileges').select('role_id, module').eq('privilege_code', 'access').in('role_id', roleIds),
      ])
      roleCodes = new Map(((rolesRes.data ?? []) as { id: string; code: string }[]).map(r => [r.id, r.code]))
      roleModules = new Map()
      for (const rp of (rpRes.data ?? []) as { role_id: string; module: string }[]) {
        const s = roleModules.get(rp.role_id) ?? new Set<string>()
        s.add(rp.module)
        roleModules.set(rp.role_id, s)
      }
    }

    const rolesByPerson = new Map<string, string[]>()
    for (const r of personRoles) {
      const a = rolesByPerson.get(r.person_id) ?? []
      a.push(r.role_id)
      rolesByPerson.set(r.person_id, a)
    }
    const overridesByPerson = new Map<string, { module: string; is_granted: boolean; expires_at: string | null }[]>()
    for (const o of (ppRes.data ?? []) as { person_id: string; module: string; is_granted: boolean; expires_at: string | null }[]) {
      const a = overridesByPerson.get(o.person_id) ?? []
      a.push(o)
      overridesByPerson.set(o.person_id, a)
    }
    const seated = new Set(((seatsRes.data ?? []) as { person_id: string }[]).map(s => s.person_id))
    const personName = new Map(
      ((personsRes.data ?? []) as { id: string; first_name: string | null; last_name: string | null; middle_name: string | null; hebrew_name: string | null }[])
        .map(p => [p.id, [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(' ') || p.hebrew_name || '—'])
    )

    const nowMs = Date.now()
    const blank_screen: HealthPerson[] = []
    const no_seat: HealthPerson[] = []
    for (const acc of accs) {
      const myRoleIds = rolesByPerson.get(acc.person_id) ?? []
      if (myRoleIds.some(id => roleCodes.get(id) === 'superadmin')) continue

      const modules = new Set<string>()
      for (const id of myRoleIds) for (const m of roleModules.get(id) ?? []) modules.add(m)
      for (const o of overridesByPerson.get(acc.person_id) ?? []) {
        if (o.expires_at && new Date(o.expires_at).getTime() <= nowMs) continue
        if (o.is_granted) modules.add(o.module); else modules.delete(o.module)
      }

      const row: HealthPerson = {
        person_id: acc.person_id,
        name: personName.get(acc.person_id) ?? '—',
        login_email: acc.login_email,
      }
      if (modules.size === 0) blank_screen.push(row)
      if (!seated.has(acc.person_id)) no_seat.push(row)
    }

    return NextResponse.json({ blank_screen, no_seat })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
