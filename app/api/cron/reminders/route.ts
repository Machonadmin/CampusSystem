import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { materializeAllDueReminders, materializeAllTaskDeadlines } from '@/lib/notifications/reminders'

/**
 * GET /api/cron/reminders — планировщик напоминаний (Vercel Cron).
 *
 * Материализует созревшие напоминания календаря и дедлайны задач по ВСЕМ
 * пользователям, чтобы уведомления создавались, даже если никто не открывал
 * колокольчик. Ленивая материализация в GET /api/notifications остаётся для
 * внутридневной свежести, когда пользователи активны.
 *
 * Защита: если задан env CRON_SECRET, требуем заголовок
 * `Authorization: Bearer <CRON_SECRET>` (Vercel Cron присылает его
 * автоматически, когда переменная задана). Если CRON_SECRET не задан — маршрут
 * открыт (создаёт лишь легитимные уведомления, без утечки/разрушения данных);
 * задать CRON_SECRET рекомендуется. Маршрут внесён в PUBLIC_API_PREFIXES, т.к.
 * у cron нет пользовательской сессии.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const sb = createServerClient()
  const remindersCreated = await materializeAllDueReminders(sb)
  const taskDeadlinesCreated = await materializeAllTaskDeadlines(sb)

  return NextResponse.json({
    ok: true,
    reminders_created: remindersCreated,
    task_deadlines_created: taskDeadlinesCreated,
  })
}
