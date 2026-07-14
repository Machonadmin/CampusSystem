import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { materializeDueReminders, materializeTaskDeadlines } from '@/lib/notifications/reminders'

/**
 * GET /api/notifications — мои последние уведомления + число непрочитанных.
 *
 * Защищено к отсутствию таблицы: если миграция ещё не применена (42P01),
 * возвращаем пустой список — колокольчик просто не показывает ничего, а не
 * роняет весь дашборд. Пользователь видит ТОЛЬКО свои (person_id = session).
 */

const LIMIT = 20

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: serverT('unauthorized') }, { status: 401 })

    const sb = createServerClient()

    // Материализуем созревшие напоминания календаря + дедлайны задач (best-effort).
    await materializeDueReminders(sb, session.person_id)
    await materializeTaskDeadlines(sb, session.person_id)

    const { data, error } = await sb
      .from('notifications')
      .select('id, type, title, body, link, read_at, created_at')
      .eq('person_id', session.person_id)
      .order('created_at', { ascending: false })
      .limit(LIMIT)

    // Таблицы ещё нет (миграция не применена) — тихо отдаём пусто.
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ notifications: [], unread: 0 })
      throw error
    }

    const notifications = data ?? []
    const unread = notifications.filter(n => !n.read_at).length

    return NextResponse.json({ notifications, unread })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
