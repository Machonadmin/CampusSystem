import type { createServerClient } from '@/lib/supabase/server'
import type { PrivilegeModule, RoleCode } from '@/types/database'
import { MAINTENANCE_ROLE_CODES } from '@/lib/tasks/maintenance-link'

type SB = ReturnType<typeof createServerClient>

/**
 * ─── Кто считается «человеком из техслужбы» ──────────────────────────────────
 *
 * Раньше здесь были ТОЛЬКО два кода ролей из сида (maintenance_head /
 * maintenance_staff). Это оказалось неверным: владелец завёл своего человека под
 * ролью с другим названием («מנהל תחזוקה»), и признак не сработал — галочка «это
 * задача по эксплуатации» не появлялась, задача до доски техслужбы не доходила,
 * а объяснить это было нечем.
 *
 * Теперь признак берётся ИЗ НАСТРОЕК, а не из захардкоженного списка:
 *
 *   человек из техслужбы = носитель роли maintenance_head/maintenance_staff
 *                        ∪ тот, кому выдано право maintenance.manage
 *                          (ролью ИЛИ персонально)
 *
 * То есть «настроен работать в модуле „Эксплуатация“». Так работают любые
 * собственные роли владельца, переименования и точечные выдачи — ничего не
 * нужно дописывать в код. Персональный deny снимает признак.
 *
 * ВАЖНО: проверяются РЕАЛЬНЫЕ строки прав, а НЕ hasMaintenancePrivilege — иначе
 * суперадминский обход сделал бы «человеком из техслужбы» каждого админа, и
 * галочка вылезала бы при постановке задачи кому угодно.
 *
 * Возвращает NULL, если состав установить не удалось (ошибка чтения), и пустое
 * множество, если таких людей действительно нет. Разница принципиальна:
 *   • при ВЫДАЧЕ метки null = «нельзя» (fail-closed);
 *   • при ПЕРЕПРОВЕРКЕ уже помеченной задачи null = «не знаю», метку не трогаем,
 *     иначе разовый сбой запроса стёр бы её у живой задачи.
 */

/** Право модуля, наличие которого означает «работает в эксплуатации». */
const MAINTENANCE_WORK_PRIVILEGE = 'manage'

export async function maintenanceStaffPersonIds(sb: SB): Promise<Set<string> | null> {
  // ── 1. Роли: сидовые коды + любые роли, которым выдано maintenance.manage ──
  const [seeded, granted] = await Promise.all([
    sb.from('roles').select('id').in('code', MAINTENANCE_ROLE_CODES as unknown as RoleCode[]),
    sb.from('role_privileges')
      .select('role_id')
      .eq('module', 'maintenance' as PrivilegeModule)
      .eq('privilege_code', MAINTENANCE_WORK_PRIVILEGE),
  ])
  if (seeded.error || granted.error) return null

  const roleIds = new Set<string>([
    ...(seeded.data ?? []).map(r => r.id as string),
    ...(granted.data ?? []).map(r => r.role_id as string),
  ])

  const people = new Set<string>()

  if (roleIds.size > 0) {
    const { data: personRows, error: prErr } = await sb
      .from('person_roles')
      .select('person_id')
      .in('role_id', [...roleIds])
    if (prErr) return null
    for (const r of personRows ?? []) {
      if (r.person_id) people.add(r.person_id as string)
    }
  }

  // ── 2. Персональные выдачи/запреты поверх ролей ──
  // Отсутствие таблицы — не ошибка: остаёмся на ролевом составе.
  try {
    const { data: overrides } = await sb
      .from('person_privileges')
      .select('person_id, is_granted, expires_at')
      .eq('module', 'maintenance' as PrivilegeModule)
      .eq('privilege_code', MAINTENANCE_WORK_PRIVILEGE)
    const now = Date.now()
    for (const r of (overrides ?? []) as Array<{ person_id: string; is_granted: boolean; expires_at: string | null }>) {
      if (!r.person_id) continue
      if (r.expires_at && new Date(r.expires_at).getTime() <= now) continue
      if (r.is_granted) people.add(r.person_id)
      else people.delete(r.person_id)
    }
  } catch { /* нет таблицы — ролевого состава достаточно */ }

  return people
}
