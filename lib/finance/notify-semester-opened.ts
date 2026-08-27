import { createServerClient } from '@/lib/supabase/server'
import { createNotifications } from '@/lib/notifications/create'

type SB = ReturnType<typeof createServerClient>

/** Финансовые роли, которым уходит уведомление об открытии семестра. */
const FINANCE_ROLE_CODES = ['finance_director', 'accountant']

/**
 * Возвращает person_id активных пользователей с указанными ролями.
 * Деплой-безопасно и best-effort: при любой ошибке (нет таблицы ролей и т.п.)
 * возвращает пустой список, а не бросает.
 */
async function personsWithRoles(sb: SB, roleCodes: string[]): Promise<string[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: roleRows } = await sb.from('roles').select('id').in('code', roleCodes as any)
    const roleIds = (roleRows ?? []).map(r => r.id)
    if (roleIds.length === 0) return []

    const { data: prs } = await sb.from('person_roles').select('person_id').in('role_id', roleIds)
    const ids = [...new Set((prs ?? []).map(p => p.person_id))]
    if (ids.length === 0) return []

    const { data: accts } = await sb
      .from('person_accounts')
      .select('person_id')
      .in('person_id', ids)
      .eq('is_active', true)
    return [...new Set((accts ?? []).map(a => a.person_id))]
  } catch {
    return []
  }
}

interface SemesterOpenedInfo {
  classGroupId: string
  name: string
  yearLabel?: string | null
  termNumber?: number | null
}

/**
 * Уведомляет финансовый отдел (finance_director, accountant), что в «Учёбе»
 * открыли новый семестр — им нужно проверить стоимость семестра и зарплату
 * преподавателей (решение владельца: суммы задаются в модуле «Финансы», а не
 * в «Учёбе»).
 *
 * Best-effort: createNotifications никогда не бросает; вызывать после успешного
 * создания семестра, не оборачивая основной ответ в его ошибку.
 */
export async function notifyFinanceSemesterOpened(sb: SB, info: SemesterOpenedInfo): Promise<void> {
  const recipients = await personsWithRoles(sb, FINANCE_ROLE_CODES)
  if (recipients.length === 0) return

  const suffix = [info.yearLabel, info.termNumber != null ? `סמסטר ${info.termNumber}` : null]
    .filter(Boolean)
    .join(' · ')
  const title = `נפתח סמסטר חדש: ${info.name}`
  const body = suffix
    ? `${suffix} — יש לקבוע את עלות הסמסטר ואת שכר המורים במודול הכספים.`
    : 'יש לקבוע את עלות הסמסטר ואת שכר המורים במודול הכספים.'

  await createNotifications(
    sb,
    recipients.map(pid => ({
      person_id: pid,
      type: 'finance_semester_opened',
      title,
      body,
      link: '/dashboard/finance/semesters',
      metadata: { class_group_id: info.classGroupId },
    })),
  )
}
