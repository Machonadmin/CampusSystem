import type { createServerClient } from '@/lib/supabase/server'
import type { PrivilegeModule } from '@/types/database'
import { createNotifications } from '@/lib/notifications/create'

type SB = ReturnType<typeof createServerClient>

/** Модули «Учёбы», под которыми может лежать право (как EDU_PRIV_MODULES в lib/education/permissions). */
const EDU_PRIV_MODULES = ['education', 'recruitment', 'admission', 'studies'] as unknown as PrivilegeModule[]
const FINAL_APPROVE = 'jewishness_final_approve'

/**
 * Кто даёт финальное утверждение еврейства («אחראית היהדות»): носители роли с
 * правом jewishness_final_approve ∪ персональные выдачи; персональный запрет
 * снимает. Суперадмины, у которых права нет явно, сюда НЕ входят — иначе
 * уведомление получал бы каждый админ.
 */
export async function finalApproverPersonIds(sb: SB): Promise<Set<string>> {
  const people = new Set<string>()

  const { data: rp, error: rpErr } = await sb
    .from('role_privileges')
    .select('role_id')
    .in('module', EDU_PRIV_MODULES)
    .eq('privilege_code', FINAL_APPROVE)
  if (rpErr) throw rpErr
  const roleIds = [...new Set((rp ?? []).map(r => r.role_id as string))]
  if (roleIds.length > 0) {
    const { data: pr, error: prErr } = await sb
      .from('person_roles').select('person_id').in('role_id', roleIds)
    if (prErr) throw prErr
    for (const r of pr ?? []) if (r.person_id) people.add(r.person_id as string)
  }

  // Персональные выдачи/запреты поверх ролей. Нет таблицы — остаёмся на ролях.
  try {
    const { data: overrides } = await sb
      .from('person_privileges')
      .select('person_id, is_granted, expires_at')
      .in('module', EDU_PRIV_MODULES)
      .eq('privilege_code', FINAL_APPROVE)
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

/**
 * После «בדיקה ראשונית» рава — уведомление в колокольчик (и пуш) тем, кто даёт
 * финальное утверждение: «הרב סיים בדיקה ראשונית של …, אפשר לתת אישור סופי»
 * (решение владельца 2026-10-19). Себя (checkedBy) не уведомляет.
 * Best-effort: никогда не бросает — статус уже записан.
 */
export async function notifyFinalApprovers(sb: SB, opts: { journeyId: string; checkedBy: string }): Promise<void> {
  try {
    const recipients = [...(await finalApproverPersonIds(sb))].filter(id => id !== opts.checkedBy)
    if (recipients.length === 0) return

    const { data: j } = await sb
      .from('education_journeys')
      .select('person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name)')
      .eq('id', opts.journeyId)
      .maybeSingle()
    const p = (j?.person as unknown as { full_name?: string | null; hebrew_name?: string | null } | null) ?? null
    const name = (p?.hebrew_name || p?.full_name || '').trim()

    await createNotifications(sb, recipients.map(personId => ({
      person_id: personId,
      type: 'jewishness_initial_check',
      title: name
        ? `הרב סיים בדיקה ראשונית של ${name}, אפשר לתת אישור סופי`
        : 'הרב סיים בדיקה ראשונית, אפשר לתת אישור סופי',
      link: '/dashboard/jewishness',
      metadata: { journey_id: opts.journeyId },
    })))
  } catch (e) {
    console.error('[jewishness/notify] final approvers:', e)
  }
}
