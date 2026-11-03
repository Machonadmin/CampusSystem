import { createServerClient } from '@/lib/supabase/server'
import { isMissingColumn, isMissingTable } from '@/lib/supabase/errors'
import { pushNotificationRows } from '@/lib/notifications/create'
import {
  OVERDUE_REMIND_DAYS, REMIND_DAYS_BEFORE_MIN, REMIND_DAYS_BEFORE_MAX,
  addDaysISO, taskReminderFor, taskReminderTitle,
} from '@/lib/tasks/reminders'

type SB = ReturnType<typeof createServerClient>

/**
 * תזמון תזכורות למשימות — дополнение к materializeAllTaskDeadlines
 * («משימה להיום» / «משימה למחר», которые остаются как были):
 *
 *   • раннее напоминание: если у задачи задан remind_days_before = N (2..30),
 *     исполнитель получает уведомление ровно за N дней до срока;
 *   • после просрочки: открытая задача со сроком в прошлом напоминает
 *     исполнителю на 1-й, 3-й и 7-й день просрочки (не бесконечно).
 *
 * Получатель — исполнитель (assignee_id). Задачи в пуле отдела без
 * исполнителя пропускаются — как и в существующих дедлайнах.
 * Дедуп: type='task_reminder' + metadata { task_id, due_date, reminder }.
 */

interface TaskRowLite {
  id: string
  title: string
  due_date: string
  assignee_id: string
  remind_days_before?: number | null
}

const OPEN_FILTER = '("completed","cancelled","declined")'

/**
 * Пакетная версия для cron (/api/cron/reminders). Возвращает число созданных
 * уведомлений. Best-effort: никогда не бросает. Устойчива к тому, что миграция
 * с remind_days_before ещё не применена — тогда работают только просрочки.
 */
export async function materializeAllTaskReminders(sb: SB, now: Date = new Date()): Promise<number> {
  let created = 0
  try {
    const p = (n: number) => String(n).padStart(2, '0')
    const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`

    const candidates: TaskRowLite[] = []

    // 1) Просрочки: ровно 1 / 3 / 7 дней назад.
    const overdueDates = OVERDUE_REMIND_DAYS.map(d => addDaysISO(today, -d))
    const { data: overdue, error: oErr } = await sb
      .from('tasks')
      .select('id, title, due_date, assignee_id')
      .not('status', 'in', OPEN_FILTER)
      .not('assignee_id', 'is', null)
      .in('due_date', overdueDates)
      .limit(2000)
    if (!oErr && overdue) candidates.push(...(overdue as unknown as TaskRowLite[]))

    // 2) Ранние: задачи с remind_days_before и сроком через 2..30 дней.
    const { data: early, error: eErr } = await sb
      .from('tasks')
      // remind_days_before нет в сгенерированных типах до регенерации.
      .select('id, title, due_date, assignee_id, remind_days_before')
      .not('status', 'in', OPEN_FILTER)
      .not('assignee_id', 'is', null)
      .not('remind_days_before', 'is', null)
      .gte('due_date', addDaysISO(today, REMIND_DAYS_BEFORE_MIN))
      .lte('due_date', addDaysISO(today, REMIND_DAYS_BEFORE_MAX))
      .limit(2000)
    if (eErr && !isMissingColumn(eErr)) console.error('[task-reminders] early query:', eErr)
    if (!eErr && early) candidates.push(...(early as unknown as TaskRowLite[]))

    for (const tk of candidates) {
      const r = taskReminderFor(today, tk.due_date, tk.remind_days_before ?? null)
      if (!r) continue

      const metadata = { task_id: tk.id, due_date: tk.due_date, reminder: r.key }
      const { data: existing } = await sb
        .from('notifications')
        .select('id')
        .eq('person_id', tk.assignee_id)
        .eq('type', 'task_reminder')
        .contains('metadata', metadata)
        .limit(1)
      if (existing && existing.length > 0) continue

      const row = {
        person_id: tk.assignee_id,
        type: 'task_reminder',
        title: taskReminderTitle(r, tk.title),
        link: `/dashboard/tasks/${tk.id}`,
        metadata,
      }
      const { error: nErr } = await sb
        .from('notifications')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(row as any)
      if (nErr && isMissingTable(nErr)) return created
      if (!nErr) {
        created++
        await pushNotificationRows(sb, [row])
      }
    }
  } catch {
    /* тихо */
  }
  return created
}
