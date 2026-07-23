import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'

/**
 * DELETE /api/calendar/events/[id] — удалить своё событие календаря
 * (owner_id = session). Идемпотентно.
 */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireCalendarUser()
    const sb = createServerClient()
    const { error } = await sb
      .from('calendar_events')
      .delete()
      .eq('id', params.id)
      .eq('owner_id', session.person_id)
    if (error && error.code !== '42P01') throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
