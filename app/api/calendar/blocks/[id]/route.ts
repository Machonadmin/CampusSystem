import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { mapDbError } from '@/lib/calendar/http'
import { errorResponse } from '@/lib/api/handler'

/**
 * DELETE /api/calendar/blocks/[id] — снять пометку выходного дня. Только строки
 * владельца (provider_id = session.person_id).
 */
export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await requireCalendarUser()
    const sb = createServerClient()

    const { data, error } = await sb
      .from('calendar_blocks')
      .delete()
      .eq('id', params.id)
      .eq('provider_id', session.person_id)
      .select('id')
      .maybeSingle()
    if (error) {
      const m = mapDbError(error)
      return errorResponse(m)
    }
    if (!data) return apiError('day_off_not_found', 404)

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return errorResponse(m)
    }
    return errorResponse(e)
  }
}
