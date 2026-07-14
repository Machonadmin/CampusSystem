import { createServerClient } from '@/lib/supabase/server'

type SB = ReturnType<typeof createServerClient>

/**
 * Материализует «созревшие» напоминания календаря в уведомления колокольчика —
 * без внешнего планировщика. Вызывается при опросе GET /api/notifications: для
 * событий пользователя с reminder_at <= now и ещё не сработавших (reminded_at
 * IS NULL) создаётся уведомление, и только ПОСЛЕ успешной вставки проставляется
 * reminded_at (если таблицы notifications нет — напоминание не теряется, попробуем
 * снова). Best-effort: никогда не бросает, молча пропускает при отсутствии таблиц.
 */
export async function materializeDueReminders(sb: SB, personId: string): Promise<void> {
  try {
    const nowIso = new Date().toISOString()
    const { data: due, error } = await sb
      .from('calendar_events')
      .select('id, title, link')
      .eq('owner_id', personId)
      .not('reminder_at', 'is', null)
      .is('reminded_at', null)
      .lte('reminder_at', nowIso)
      .limit(50)
    if (error || !due || due.length === 0) return

    for (const ev of due as Array<{ id: string; title: string; link: string | null }>) {
      const { error: nErr } = await sb
        .from('notifications')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          person_id: personId,
          type: 'reminder',
          title: ev.title,
          link: ev.link ?? '/dashboard/calendar',
          metadata: { calendar_event_id: ev.id },
        } as any)
      // Помечаем сработавшим только если уведомление реально создано.
      if (!nErr) {
        await sb.from('calendar_events')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ reminded_at: nowIso } as any)
          .eq('id', ev.id)
      }
    }
  } catch {
    /* тихо — напоминания не критичны для отдачи уведомлений */
  }
}
