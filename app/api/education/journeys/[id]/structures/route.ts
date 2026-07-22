import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege, hasEducationPrivilege } from '@/lib/education/permissions'

/**
 * Многоструктурное членство студентки (journey_structures).
 *
 *   GET    — дополнительные структуры (кроме primary) этой journey.
 *   POST   — добавить членство в структуру { department_id }. Право:
 *            manage_students в ЦЕЛЕВОЙ структуре (её руководитель принимает
 *            студентку к себе).
 *   DELETE ?department_id=… — убрать членство. То же право.
 *
 * Деплой-безопасно: если таблицы ещё нет (миграция journey_structures не
 * применена) — GET отдаёт пустой список, POST/DELETE → 503.
 */
function u(sb: ReturnType<typeof createServerClient>): SupabaseClient {
  return sb as unknown as SupabaseClient
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (u(sb)
      .from('journey_structures')
      .select('department_id, added_at, department:departments(id, name, name_he, name_en)')
      .eq('journey_id', params.id) as any)
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ structures: [] })
      throw error
    }
    return NextResponse.json({ structures: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code === '42P01') return NextResponse.json({ structures: [] })
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json() as { department_id?: string }
    const deptId = body.department_id?.trim()
    if (!deptId) return apiError('department_id_required', 400)

    // Право — manage_students В ЦЕЛЕВОЙ структуре (её руководитель принимает).
    const session = await requireEducationPrivilege('manage_students', { department_id: deptId })

    const sb = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await u(sb).from('journey_structures').insert({
      journey_id: params.id, department_id: deptId, added_by: session.person_id,
    } as any)
    if (error) {
      if (error.code === '42P01') return apiError('feature_not_migrated', 503)
      if (error.code === '23505') return NextResponse.json({ ok: true }) // уже состоит — идемпотентно
      if (error.code === '23503') return apiError('invalid_reference', 400)
      throw error
    }
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const deptId = request.nextUrl.searchParams.get('department_id')?.trim()
    if (!deptId) return apiError('department_id_required', 400)

    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const allowed = session.roles.includes('superadmin')
      || await hasEducationPrivilege(session, 'manage_students', { department_id: deptId })
    if (!allowed) return apiError('forbidden', 403)

    const sb = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (u(sb).from('journey_structures').delete().eq('journey_id', params.id).eq('department_id', deptId) as any)
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ ok: true })
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
