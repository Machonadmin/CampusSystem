import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageStaffComp } from '@/lib/finance/staff-comp'

/**
 * Одна запись хавруты (журнал моры).
 *   PATCH  { summary?, private_notes? } — редактирование журнала.
 *   DELETE — удалить ошибочную запись.
 * Право: автор (person_id == session.person_id) ИЛИ менеджер (canManageStaffComp).
 * private_notes видят только автор+менеджер (ученице НИКОГДА — см. student-sync).
 * Деплой-безопасно (42P01).
 */
function u(sb: ReturnType<typeof createServerClient>) { return sb as unknown as SupabaseClient }

async function loadOwner(sb: ReturnType<typeof createServerClient>, id: string): Promise<{ person_id: string; entry_type: string } | null | 'missing_table'> {
  try {
    const { data, error } = await u(sb).from('staff_work_entries').select('person_id, entry_type').eq('id', id).maybeSingle()
    if (error) throw error
    return (data as { person_id: string; entry_type: string } | null) ?? null
  } catch (e) {
    if ((e as { code?: string }).code === '42P01') return 'missing_table'
    throw e
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)

    const sb = createServerClient()
    const owner = await loadOwner(sb, params.id)
    if (owner === 'missing_table') return apiError('feature_not_migrated', 503)
    if (!owner || owner.entry_type !== 'chavruta') return apiError('not_found', 404)
    const isAuthor = owner.person_id === session.person_id
    if (!isAuthor && !(await canManageStaffComp(session))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { summary?: string; private_notes?: string }
    const patch: Record<string, unknown> = {}
    if (body.summary !== undefined) patch.summary = (body.summary ?? '').trim() || null
    if (body.private_notes !== undefined) patch.private_notes = (body.private_notes ?? '').trim() || null
    if (Object.keys(patch).length === 0) return apiError('invalid_reference', 400)

    const { data, error } = await u(sb).from('staff_work_entries')
      .update(patch).eq('id', params.id)
      .select('id, entry_date, amount, student_journey_id, summary, private_notes, created_at')
      .single()
    if (error) {
      if ((error as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      throw error
    }
    return NextResponse.json({ session: data })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)

    const sb = createServerClient()
    const owner = await loadOwner(sb, params.id)
    if (owner === 'missing_table') return apiError('feature_not_migrated', 503)
    if (!owner || owner.entry_type !== 'chavruta') return apiError('not_found', 404)
    const isAuthor = owner.person_id === session.person_id
    if (!isAuthor && !(await canManageStaffComp(session))) return apiError('forbidden', 403)

    const { error } = await u(sb).from('staff_work_entries').delete().eq('id', params.id)
    if (error) {
      if ((error as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
