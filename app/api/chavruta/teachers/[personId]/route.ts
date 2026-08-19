import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageStaffComp } from '@/lib/finance/staff-comp'

/**
 * DELETE /api/chavruta/teachers/[personId] — убрать РУЧНОГО мору хавруты.
 * Кодеш-учителей так удалить нельзя (они авто), поэтому удаляем лишь строку из
 * chavruta_teachers. Право — как staff-comp manage. Деплой-безопасно.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { personId: string } },
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageStaffComp(session))) return apiError('forbidden', 403)

    const personId = (params.personId ?? '').trim()
    if (!personId) return apiError('invalid_reference', 400)

    const sb = createServerClient()
    const { error } = await (sb as unknown as SupabaseClient)
      .from('chavruta_teachers').delete().eq('person_id', personId)
    if (error) {
      const code = (error as { code?: string }).code
      if (code === '42P01') return apiError('feature_not_migrated', 503)
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
