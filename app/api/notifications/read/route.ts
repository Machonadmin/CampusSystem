import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

/**
 * POST /api/notifications/read — пометить прочитанными.
 * Тело: { id?: string, all?: boolean }. Помечает только СВОИ уведомления
 * (person_id = session). Идемпотентно.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const body = await request.json().catch(() => ({})) as { id?: string; all?: boolean }
    const sb = createServerClient()
    const nowIso = new Date().toISOString()

    let q = sb
      .from('notifications')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ read_at: nowIso } as any)
      .eq('person_id', session.person_id)
      .is('read_at', null)

    if (body.id) {
      q = q.eq('id', body.id)
    } else if (!body.all) {
      return apiError('required_fields_missing', 400)
    }

    const { error } = await q
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ ok: true }) // таблицы ещё нет
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
