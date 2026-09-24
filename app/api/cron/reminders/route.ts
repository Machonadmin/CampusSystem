import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { materializeAllDueReminders, materializeAllTaskDeadlines } from '@/lib/notifications/reminders'
import { materializeChavrutaReminders } from '@/lib/chavruta/reminder'
import { materializeAbsenceThresholdAlerts } from '@/lib/education/absence-alerts'
import { cronAuthGuard } from '@/lib/cron/auth'

/**
 * GET /api/cron/reminders — планировщик напоминаний (Vercel Cron).
 *
 * Материализует созревшие напоминания календаря и дедлайны задач по ВСЕМ
 * пользователям, чтобы уведомления создавались, даже если никто не открывал
 * колокольчик. Ленивая материализация в GET /api/notifications остаётся для
 * внутридневной свежести, когда пользователи активны.
 *
 * Защита (fail-closed, lib/cron/auth): CRON_SECRET ОБЯЗАТЕЛЕН. Если он не задан
 * на сервере — маршрут отвечает 503 и НИЧЕГО не делает (раньше он был открыт
 * всему интернету). Если задан — требуем `Authorization: Bearer <CRON_SECRET>`
 * (Vercel Cron присылает его автоматически). Маршрут внесён в
 * PUBLIC_API_PREFIXES, т.к. у cron нет пользовательской сессии.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // FAIL-CLOSED: без настроенного CRON_SECRET маршрут не выполняется вовсе (503),
  // с настроенным — требует Authorization: Bearer <CRON_SECRET>. См. lib/cron/auth.
  const denied = cronAuthGuard(request)
  if (denied) return denied

  const sb = createServerClient()
  const remindersCreated = await materializeAllDueReminders(sb)
  const taskDeadlinesCreated = await materializeAllTaskDeadlines(sb)
  const chavrutaReminders = await materializeChavrutaReminders(sb) // только по средам
  const absenceAlerts = await materializeAbsenceThresholdAlerts(sb) // порог пропусков, с дедупом

  return NextResponse.json({
    ok: true,
    reminders_created: remindersCreated,
    task_deadlines_created: taskDeadlinesCreated,
    chavruta_reminders: chavrutaReminders,
    absence_alerts: absenceAlerts,
  })
}
