import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { journeyDeptTarget } from '@/lib/education/journey-target'

/**
 * Встречи студентки (§5): преподаватель назначает встречу после урока →
 * появляется в её календаре → можно отметить «выполнено». Хранится в
 * существующей таблице `appointments` (provider_id = кто назначил,
 * journey_id = студентка, status scheduled/completed/cancelled/no_show).
 *
 * GET   — список встреч этой студентки.
 * POST  — назначить: { title, starts_at, ends_at, reason? } (provider = я).
 * PATCH — { appt_id, status } отметить выполнено/отменить.
 *
 * Право: view_students в подразделении студентки (кто работает с ней — может
 * назначить/отметить). Деплой-безопасно (42P01 → пусто).
 */

async function gate(journeyId: string, allowStudent: boolean) {
  const session = await getSession()
  if (!session) return { err: apiError('unauthorized', 401) }
  const sb = createServerClient()
  // Студентка: только ЧТЕНИЕ (allowStudent) и только СВОЯ journey. Создавать/
  // менять встречи она не может — POST/PATCH передают allowStudent=false → 403.
  if (session.principal === 'student') {
    if (!allowStudent || session.student_journey_id !== journeyId) {
      return { err: apiError('forbidden', 403) }
    }
    return { sb, session }
  }
  const ok = session.roles.includes('superadmin')
    || await hasEducationPrivilege(session, 'view_students', await journeyDeptTarget(sb, journeyId))
  if (!ok) return { err: apiError('forbidden', 403) }
  return { sb, session }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await gate(params.id, true)
    if (g.err) return g.err
    const { data, error } = await g.sb!
      .from('appointments')
      .select('id, title, reason, starts_at, ends_at, status, provider:persons!appointments_provider_id_fkey(full_name, hebrew_name)')
      .eq('journey_id', params.id)
      .order('starts_at', { ascending: false })
    if (error) {
      if ((error as { code?: string }).code === '42P01') return NextResponse.json({ meetings: [] })
      throw error
    }
    return NextResponse.json({ meetings: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await gate(params.id, false)
    if (g.err) return g.err
    const body = await request.json().catch(() => ({})) as { title?: string; starts_at?: string; ends_at?: string; reason?: string | null }
    const title = (body.title ?? '').trim()
    const starts = (body.starts_at ?? '').trim()
    const ends = (body.ends_at ?? '').trim()
    if (!title) return apiError('title_required', 400)
    if (!starts || !ends || !(new Date(starts) < new Date(ends))) return apiError('invalid_field_value_status', 400)

    const { data, error } = await g.sb!
      .from('appointments')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        provider_id: g.session!.person_id, journey_id: params.id, title,
        reason: (body.reason ?? '').trim() || null, starts_at: starts, ends_at: ends,
        status: 'scheduled', created_by: g.session!.person_id,
      } as any).select('id').single()
    if (error) {
      if ((error as { code?: string }).code === '42P01') return apiError('feature_unavailable', 503)
      throw error
    }
    return NextResponse.json({ ok: true, id: (data as { id: string }).id }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

const STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const g = await gate(params.id, false)
    if (g.err) return g.err
    const body = await request.json().catch(() => ({})) as { appt_id?: string; status?: string }
    const apptId = (body.appt_id ?? '').trim()
    const status = (body.status ?? '').trim()
    if (!apptId || !(STATUSES as readonly string[]).includes(status)) return apiError('invalid_field_value_status', 400)

    const { error } = await g.sb!
      .from('appointments')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ status, updated_at: new Date().toISOString() } as any)
      .eq('id', apptId).eq('journey_id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
