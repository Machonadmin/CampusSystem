import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'

/**
 * Ответ приглашённого участника на встречу: принять / отклонить.
 * Только сам участник (person_id = я) меняет свой статус. Для тех, чьё участие
 * требовало подтверждения (pending_approval, приглашён кем-то ниже по иерархии),
 * это и есть согласование встречи.
 *
 * POST body: { action: 'accept' | 'decline' }
 * Деплой-безопасно: нет таблицы → 503.
 */
function u(sb: ReturnType<typeof createServerClient>): SupabaseClient {
  return sb as unknown as SupabaseClient
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireCalendarUser()
    const body = await request.json().catch(() => ({})) as { action?: string }
    const action = body.action
    if (action !== 'accept' && action !== 'decline') return apiError('invalid_field_value_status', 400)

    const sb = createServerClient()
    const newStatus = action === 'accept' ? 'accepted' : 'declined'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (u(sb).from('appointment_attendees')
      .update({ status: newStatus, responded_at: new Date().toISOString() })
      .eq('appointment_id', params.id)
      .eq('person_id', session.person_id)
      .select('appointment_id') as any)
    if (error) {
      if (error.code === '42P01') return apiError('feature_not_migrated', 503)
      throw error
    }
    if (!data || (data as unknown[]).length === 0) return apiError('forbidden', 403) // я не участник этой встречи

    return NextResponse.json({ ok: true, status: newStatus })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
