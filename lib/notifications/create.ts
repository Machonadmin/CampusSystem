import { createServerClient } from '@/lib/supabase/server'
import type { NotificationInsert } from '@/types/database'

type SB = ReturnType<typeof createServerClient>

/**
 * Создаёт уведомления пачкой. Best-effort: НИКОГДА не бросает (вызывается из
 * фоновой синхронизации приёма и не должен ронять её). Если таблицы ещё нет
 * (миграция не применена, 42P01) — молча пропускает.
 */
export async function createNotifications(sb: SB, rows: NotificationInsert[]): Promise<void> {
  if (rows.length === 0) return
  try {
    const { error } = await sb
      .from('notifications')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(rows as any)
    if (error && error.code !== '42P01') {
      console.error('[notifications] insert:', error)
    }
  } catch (e) {
    console.error('[notifications] insert:', e)
  }
}
