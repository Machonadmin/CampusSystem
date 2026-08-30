import { createServerClient } from '@/lib/supabase/server'
import type { NotificationInsert } from '@/types/database'
import { sendPushToPerson } from '@/lib/push/webpush'

type SB = ReturnType<typeof createServerClient>

/**
 * Создаёт уведомления пачкой. Best-effort: НИКОГДА не бросает (вызывается из
 * фоновой синхронизации приёма и не должен ронять её). Если таблицы ещё нет
 * (миграция не применена, 42P01) — молча пропускает.
 *
 * Каждое созданное уведомление ДУБЛИРУЕТСЯ пушем на телефон (Web Push) на все
 * подписанные устройства адресата — так колокольчик и телефон всегда согласны.
 * Пуш тоже best-effort и не роняет вызывающий код.
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

  // Web Push — после вставки, по одному пушу на строку (объёмы небольшие).
  try {
    await Promise.allSettled(rows.map(r =>
      sendPushToPerson(sb, r.person_id, { title: r.title, body: r.body ?? null, link: r.link ?? null }),
    ))
  } catch (e) {
    console.error('[notifications] push:', e)
  }
}
