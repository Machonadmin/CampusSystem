import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireModuleUser } from '@/lib/modules/personal-access'
import { errorResponse } from '@/lib/api/handler'
import { db, loadMeeting } from '@/lib/meetings/access'

/**
 * DELETE /api/meetings/items/[itemId] — убрать החלטה/משימה из встречи (только
 * владелец). Уже открытая задача у ответственного НЕ удаляется: она живёт в
 * модуле משימות, её закрывают там.
 */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ itemId: string }> }) {
  try {
    const { itemId } = await props.params
    const session = await requireModuleUser('meetings')
    const sb = createServerClient()
    const { data: item, error } = await db(sb).from('appointment_action_items').select('id, appointment_id').eq('id', itemId).maybeSingle()
    if (error) throw error
    if (!item) return apiError('record_not_found', 404)
    const m = await loadMeeting(sb, session, (item as { appointment_id: string }).appointment_id)
    if (!m || !m.visibility.manageContent) return apiError('forbidden', 403)
    const { error: dErr } = await db(sb).from('appointment_action_items').delete().eq('id', itemId)
    if (dErr) throw dErr
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
