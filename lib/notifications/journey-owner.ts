import { createServerClient } from '@/lib/supabase/server'
import { createNotifications } from '@/lib/notifications/create'

type SB = ReturnType<typeof createServerClient>

/**
 * Уведомляет «владельца» лида (того, кто запустил набор — рекрутёра) о том, что
 * к его абитуриентке загрузили новый документ. Best-effort: не бросает, молча
 * пропускает при отсутствии данных/таблиц. Себя (uploaderId) не уведомляет.
 */
export async function notifyOwnerOfDocument(sb: SB, journeyId: string, uploaderId: string): Promise<void> {
  try {
    const { data: pis } = await sb
      .from('process_instances')
      .select('created_by, process_template:process_templates!inner(code)')
      .eq('journey_id', journeyId)
      .eq('process_template.code', 'recruitment')
    const ownerId = (pis ?? [])
      .map(p => (p as unknown as { created_by: string | null }).created_by)
      .find(Boolean) ?? null
    if (!ownerId || ownerId === uploaderId) return

    const { data: j } = await sb
      .from('education_journeys')
      .select('person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name)')
      .eq('id', journeyId)
      .maybeSingle()
    const p = (j?.person as unknown as { full_name?: string | null; hebrew_name?: string | null } | null) ?? null
    const name = p?.full_name || p?.hebrew_name || ''

    await createNotifications(sb, [{
      person_id: ownerId,
      type: 'document_uploaded',
      title: name ? `מסמך חדש הועלה — ${name}` : 'מסמך חדש הועלה למועמדת',
      link: `/dashboard/education/leads/${journeyId}`,
      metadata: { journey_id: journeyId },
    }])
  } catch {
    /* тихо — уведомление не критично */
  }
}
