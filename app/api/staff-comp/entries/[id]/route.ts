import type { Database } from '@/types/database'
import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageStaffComp, isSelfCompTarget, canAccessStaffCompPerson } from '@/lib/finance/staff-comp'
import { isMissingTable } from '@/lib/supabase/errors'
import { errorResponse } from '@/lib/api/handler'

/**
 * PATCH / DELETE рабочей записи. Право: manage staff-comp. Деплой-безопасно.
 */
function ent(sb: ReturnType<typeof createServerClient>) {
  return sb.from('staff_work_entries')
}

/** Владелец записи (person_id) — для запрета правки собственной зарплаты. null — записи нет. */
async function entryOwner(sb: ReturnType<typeof createServerClient>, id: string): Promise<string | null> {
  const { data, error } = await ent(sb).select('person_id').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as { person_id: string } | null)?.person_id ?? null
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageStaffComp(session))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as {
      hours?: number; amount?: number; title?: string; summary?: string; private_notes?: string; entry_date?: string
    }
    const patch: Database['public']['Tables']['staff_work_entries']['Update'] = {}
    if (body.hours !== undefined) patch.hours = Number.isFinite(Number(body.hours)) && Number(body.hours) >= 0 ? Number(body.hours) : null
    if (body.amount !== undefined) patch.amount = Number.isFinite(Number(body.amount)) && Number(body.amount) >= 0 ? Number(body.amount) : null
    if (body.title !== undefined) patch.title = (body.title ?? '').trim() || null
    if (body.summary !== undefined) patch.summary = (body.summary ?? '').trim() || null
    if (body.private_notes !== undefined) patch.private_notes = (body.private_notes ?? '').trim() || null
    if (body.entry_date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(body.entry_date)) patch.entry_date = body.entry_date
    if (Object.keys(patch).length === 0) return apiError('no_changes', 400)
    patch.updated_at = new Date().toISOString()

    const sb = createServerClient()
    let owner: string | null
    try { owner = await entryOwner(sb, params.id) }
    catch (e) { if (isMissingTable(e)) return apiError('feature_not_migrated', 503); throw e }
    if (!owner) return apiError('not_found', 404)
    if (isSelfCompTarget(session, owner)) return apiError('staff_comp_self_forbidden', 403)
    if (!(await canAccessStaffCompPerson(session, owner, 'create_invoice'))) return apiError('forbidden', 403)
    const { data, error } = await ent(sb).update(patch).eq('id', params.id)
      .select('id, entry_type, entry_date, hours, amount, student_journey_id, title, summary, private_notes, created_at').maybeSingle()
    if (error) {
      if (isMissingTable(error)) return apiError('feature_not_migrated', 503)
      throw error
    }
    if (!data) return apiError('not_found', 404)
    return NextResponse.json({ entry: data })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageStaffComp(session))) return apiError('forbidden', 403)

    const sb = createServerClient()
    let owner: string | null
    try { owner = await entryOwner(sb, params.id) }
    catch (e) { if (isMissingTable(e)) return NextResponse.json({ ok: true }); throw e }
    if (owner && isSelfCompTarget(session, owner)) return apiError('staff_comp_self_forbidden', 403)
    if (owner && !(await canAccessStaffCompPerson(session, owner, 'create_invoice'))) return apiError('forbidden', 403)
    const { error } = await ent(sb).delete().eq('id', params.id)
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ ok: true })
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
