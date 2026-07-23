import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageStaffComp } from '@/lib/finance/staff-comp'

/**
 * PATCH / DELETE рабочей записи. Право: manage staff-comp. Деплой-безопасно.
 */
function ent(sb: ReturnType<typeof createServerClient>) {
  return (sb as unknown as SupabaseClient).from('staff_work_entries')
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageStaffComp(session))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as {
      hours?: number; amount?: number; title?: string; summary?: string; private_notes?: string; entry_date?: string
    }
    const patch: Record<string, unknown> = {}
    if (body.hours !== undefined) patch.hours = Number.isFinite(Number(body.hours)) && Number(body.hours) >= 0 ? Number(body.hours) : null
    if (body.amount !== undefined) patch.amount = Number.isFinite(Number(body.amount)) && Number(body.amount) >= 0 ? Number(body.amount) : null
    if (body.title !== undefined) patch.title = (body.title ?? '').trim() || null
    if (body.summary !== undefined) patch.summary = (body.summary ?? '').trim() || null
    if (body.private_notes !== undefined) patch.private_notes = (body.private_notes ?? '').trim() || null
    if (body.entry_date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(body.entry_date)) patch.entry_date = body.entry_date
    if (Object.keys(patch).length === 0) return apiError('no_changes', 400)
    patch.updated_at = new Date().toISOString()

    const sb = createServerClient()
    const { data, error } = await ent(sb).update(patch).eq('id', params.id)
      .select('id, entry_type, entry_date, hours, amount, student_journey_id, title, summary, private_notes, created_at').maybeSingle()
    if (error) {
      if ((error as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      throw error
    }
    if (!data) return apiError('not_found', 404)
    return NextResponse.json({ entry: data })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageStaffComp(session))) return apiError('forbidden', 403)

    const sb = createServerClient()
    const { error } = await ent(sb).delete().eq('id', params.id)
    if (error) {
      if ((error as { code?: string }).code === '42P01') return NextResponse.json({ ok: true })
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
