import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { mapDbError } from '@/lib/calendar/http'

/**
 * DELETE /api/calendar/blocks/[id] — снять пометку выходного дня. Только строки
 * владельца (provider_id = session.person_id).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
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
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    if (!data) return NextResponse.json({ error: 'Выходной день не найден' }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
