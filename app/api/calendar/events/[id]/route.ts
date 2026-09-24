import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { isMissingTable } from '@/lib/supabase/errors'
import { errorResponse } from '@/lib/api/handler'

/**
 * DELETE /api/calendar/events/[id] — удалить своё событие календаря
 * (owner_id = session). Идемпотентно.
 */
export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await requireCalendarUser()
    const sb = createServerClient()
    const { error } = await sb
      .from('calendar_events')
      .delete()
      .eq('id', params.id)
      .eq('owner_id', session.person_id)
    if (error && !isMissingTable(error)) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
