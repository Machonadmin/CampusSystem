import { createServerClient } from '@/lib/supabase/server'
import { effectiveChavrutaTeacherIds } from './teachers'

type SB = ReturnType<typeof createServerClient>

/**
 * Напоминание о хавруте по СРЕДАМ: каждой море хавруты (кодеш ∪ ручные) —
 * уведомление «עם מי את עושה חברותא היום?». Вызывается из cron ежедневно, но
 * срабатывает только в среду. Дедуп по (type='chavruta_reminder', metadata.date).
 * Best-effort, деплой-безопасно (нет notifications/таблиц → 0). Возвращает число.
 */
export async function materializeChavrutaReminders(sb: SB): Promise<number> {
  try {
    const now = new Date()
    if (now.getDay() !== 3) return 0 // 0=вс … 3=среда

    const p = (n: number) => String(n).padStart(2, '0')
    const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`

    const teacherIds = [...await effectiveChavrutaTeacherIds(sb)]
    if (teacherIds.length === 0) return 0

    let created = 0
    for (const personId of teacherIds) {
      // Уже напоминали сегодня?
      const { data: existing } = await sb
        .from('notifications')
        .select('id')
        .eq('person_id', personId)
        .eq('type', 'chavruta_reminder')
        .contains('metadata', { date: today })
        .limit(1)
      if (existing && existing.length > 0) continue

      const { error } = await sb
        .from('notifications')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          person_id: personId,
          type: 'chavruta_reminder',
          title: 'עם מי את עושה חברותא היום?',
          link: '/dashboard/chavruta',
          metadata: { date: today },
        } as any)
      if (error) { if (error.code === '42P01') return created; continue }
      created++
    }
    return created
  } catch {
    return 0
  }
}
