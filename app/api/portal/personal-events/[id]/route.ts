import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

/**
 * DELETE /api/portal/personal-events/[id] — удалить личное событие студентки.
 * ПРИВАТНОСТЬ: только principal='student', и удаляем ТОЛЬКО если событие
 * принадлежит journey из сессии (eq journey_id) — ученица не может удалить
 * чужое. Деплой-безопасно (42P01).
 */

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal !== 'student' || !session.student_journey_id) {
      return apiError('forbidden', 403)
    }

    const sb = createServerClient()
    try {
      const { error } = await sb.from('student_personal_events')
        .delete()
        .eq('id', params.id)
        .eq('journey_id', session.student_journey_id)
      if (error) throw error
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_unavailable', 503)
      throw e
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
