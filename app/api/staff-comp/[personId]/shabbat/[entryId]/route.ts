import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageStaffComp } from '@/lib/finance/staff-comp'
import { isMissingTable } from '@/lib/supabase/errors'
import { errorResponse } from '@/lib/api/handler'

/**
 * DELETE /api/staff-comp/[personId]/shabbat/[entryId]
 * Удаляет событие шаббата (и каскадно — отметки участниц). Право: manage.
 * Деплой-безопасно (42P01).
 */
export async function DELETE(
  _request: NextRequest,
  props: { params: Promise<{ personId: string; entryId: string }> }
) {
  const params = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageStaffComp(session))) return apiError('forbidden', 403)

    const sb = createServerClient()
    const { error } = await (sb)
      .from('staff_work_entries').delete()
      .eq('id', params.entryId).eq('person_id', params.personId)
      .in('entry_type', ['shabbat_host', 'shabbat_family'])
    if (error) {
      if (isMissingTable(error)) return apiError('feature_not_migrated', 503)
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
