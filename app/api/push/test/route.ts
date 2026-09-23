import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api/handler'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { sendPushToPerson } from '@/lib/push/webpush'

/**
 * POST /api/push/test — тестовый пуш на все устройства ТЕКУЩЕГО пользователя
 * (self-scoped). Отвечает, сколько устройств подписано и что ответил
 * push-сервис, — чтобы владелец сам видел, где именно рвётся цепочка.
 */
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const session = await requireAuth()
    const result = await sendPushToPerson(createServerClient(), session.person_id, {
      title: 'התראת בדיקה',
      body: 'אם אתה רואה את זה, ההתראות בטלפון עובדות.',
      link: '/dashboard',
    })
    return NextResponse.json(result)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
