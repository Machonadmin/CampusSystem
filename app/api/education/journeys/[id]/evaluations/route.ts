import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { journeyDeptTarget } from '@/lib/education/journey-target'

/**
 * Отзывы (חוות דעת) на ученицу.
 *   GET  — список + флаг can_write (право писать у текущего пользователя).
 *          Право читать: view_students по подразделению journey.
 *   POST — добавить отзыв. Право: manage_students (руководитель) ЛИБО
 *          write_evaluation (учитель, которому руководитель открыл это право
 *          через person_privileges — гейт согласован владельцем).
 * Устойчиво к отсутствию таблицы student_evaluations (deploy до миграции).
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()
    const target = await journeyDeptTarget(sb, params.id)

    const canView = session.roles.includes('superadmin') || await hasEducationPrivilege(session, 'view_students', target)
    if (!canView) return apiError('forbidden', 403)

    const canWrite = await hasEducationPrivilege(session, 'manage_students', target)
      || await hasEducationPrivilege(session, 'write_evaluation', target)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .from('student_evaluations')
      .select('id, body, created_at, author_id')
      .eq('journey_id', params.id)
      .order('created_at', { ascending: false })
    if (error) {
      if ((error as { code?: string }).code === '42P01') return NextResponse.json({ evaluations: [], can_write: canWrite })
      throw error
    }

    const rows = (data ?? []) as Array<{ id: string; body: string; created_at: string; author_id: string | null }>
    const authorIds = [...new Set(rows.map(r => r.author_id).filter(Boolean) as string[])]
    const nameById = new Map<string, string>()
    if (authorIds.length > 0) {
      const { data: persons } = await sb.from('persons').select('id, full_name').in('id', authorIds)
      for (const p of (persons ?? []) as Array<{ id: string; full_name: string | null }>) nameById.set(p.id, p.full_name ?? '')
    }
    const evaluations = rows.map(r => ({ id: r.id, body: r.body, created_at: r.created_at, author: r.author_id ? nameById.get(r.author_id) ?? null : null }))
    return NextResponse.json({ evaluations, can_write: canWrite })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()
    const target = await journeyDeptTarget(sb, params.id)

    const canWrite = await hasEducationPrivilege(session, 'manage_students', target)
      || await hasEducationPrivilege(session, 'write_evaluation', target)
    if (!canWrite) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { body?: string }
    const text = (body.body ?? '').trim()
    if (!text) return apiError('note_required', 400)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb as any).from('student_evaluations').insert({
      journey_id: params.id, author_id: session.person_id, body: text.slice(0, 6000),
    })
    if (error) {
      if ((error as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      throw error
    }
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
