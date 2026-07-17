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
/**
 * Напоминания о дедлайнах задач: задачи, назначенные пользователю и активные,
 * со сроком СЕГОДНЯ или ЗАВТРА, попадают в колокольчик — по одному уведомлению
 * на задачу на дату (дедуп по metadata.task_id + due_date). Best-effort.
 */
export async function materializeTaskDeadlines(sb: SB, personId: string): Promise<void> {
  try {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const iso = (x: Date) => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`
    const today = iso(d)
    const tomorrow = iso(new Date(d.getTime() + 86_400_000))

    const { data: tasks, error } = await sb
      .from('tasks')
      .select('id, title, due_date')
      .eq('assignee_id', personId)
      .not('status', 'in', '("completed","cancelled","declined")')
      .in('due_date', [today, tomorrow])
      .limit(50)
    if (error || !tasks || tasks.length === 0) return

    for (const tk of tasks as Array<{ id: string; title: string; due_date: string }>) {
      // Дедуп: уже уведомляли об этой задаче на эту дату?
      const { data: existing } = await sb
        .from('notifications')
        .select('id')
        .eq('person_id', personId)
        .eq('type', 'task_due')
        .contains('metadata', { task_id: tk.id, due_date: tk.due_date })
        .limit(1)
      if (existing && existing.length > 0) continue

      const heading = tk.due_date === today ? 'משימה להיום' : 'משימה למחר'
      const { error: nErr } = await sb
        .from('notifications')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          person_id: personId,
          type: 'task_due',
          title: `${heading}: ${tk.title}`,
          link: `/dashboard/tasks/${tk.id}`,
          metadata: { task_id: tk.id, due_date: tk.due_date },
        } as any)
      if (nErr && nErr.code === '42P01') return // таблицы ещё нет
    }
  } catch {
    /* тихо */
  }
}

// ─── Пакетные версии для планировщика (cron) ─────────────────────────────────
//
// Ленивая материализация выше срабатывает только когда пользователь открывает
// колокольчик. Если никто не заходит — напоминания не создаются. Эти пакетные
// версии проходят по ВСЕМ пользователям и вызываются из /api/cron/reminders
// (Vercel Cron). Best-effort, устойчивы к отсутствию таблиц (42P01).

/** Дедлайны задач по ВСЕМ исполнителям (сегодня/завтра). Возвращает число созданных. */
export async function materializeAllTaskDeadlines(sb: SB): Promise<number> {
  let created = 0
  try {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const iso = (x: Date) => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`
    const today = iso(d)
    const tomorrow = iso(new Date(d.getTime() + 86_400_000))

    const { data: tasks, error } = await sb
      .from('tasks')
      .select('id, title, due_date, assignee_id')
      .not('status', 'in', '("completed","cancelled","declined")')
      .not('assignee_id', 'is', null)
      .in('due_date', [today, tomorrow])
      .limit(1000)
    if (error || !tasks || tasks.length === 0) return 0

    for (const tk of tasks as Array<{ id: string; title: string; due_date: string; assignee_id: string }>) {
      const { data: existing } = await sb
        .from('notifications')
        .select('id')
        .eq('person_id', tk.assignee_id)
        .eq('type', 'task_due')
        .contains('metadata', { task_id: tk.id, due_date: tk.due_date })
        .limit(1)
      if (existing && existing.length > 0) continue

      const heading = tk.due_date === today ? 'משימה להיום' : 'משימה למחר'
      const { error: nErr } = await sb
        .from('notifications')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          person_id: tk.assignee_id,
          type: 'task_due',
          title: `${heading}: ${tk.title}`,
          link: `/dashboard/tasks/${tk.id}`,
          metadata: { task_id: tk.id, due_date: tk.due_date },
        } as any)
      if (nErr && nErr.code === '42P01') return created // таблицы ещё нет
      if (!nErr) created++
    }
  } catch {
    /* тихо */
  }
  return created
}

/** Созревшие напоминания календаря по ВСЕМ владельцам. Возвращает число созданных. */
export async function materializeAllDueReminders(sb: SB): Promise<number> {
  let created = 0
  try {
    const nowIso = new Date().toISOString()
    const { data: due, error } = await sb
      .from('calendar_events')
      .select('id, title, link, owner_id')
      .not('reminder_at', 'is', null)
      .is('reminded_at', null)
      .lte('reminder_at', nowIso)
      .limit(1000)
    if (error || !due || due.length === 0) return 0

    for (const ev of due as Array<{ id: string; title: string; link: string | null; owner_id: string }>) {
      const { error: nErr } = await sb
        .from('notifications')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          person_id: ev.owner_id,
          type: 'reminder',
          title: ev.title,
          link: ev.link ?? '/dashboard/calendar',
          metadata: { calendar_event_id: ev.id },
        } as any)
      if (!nErr) {
        await sb.from('calendar_events')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ reminded_at: nowIso } as any)
          .eq('id', ev.id)
        created++
      } else if (nErr.code === '42P01') {
        return created // таблицы ещё нет
      }
    }
  } catch {
    /* тихо */
  }
  return created
}

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
