import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { getLessonAccess } from '@/lib/education/lesson-access'

/**
 * Заметки к уроку (журнал, append-only).
 *   GET  — список заметок (право: view_students на группе урока).
 *   POST — добавить заметку (право: учитель урока / руководитель — mark_attendance
 *          или set_lesson_topics на группе). Пишется навсегда.
 * Устойчиво к отсутствию таблицы lesson_notes (deploy до миграции).
 */

export async function GET(_req: NextRequest, { params }: { params: { lessonId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()

    const access = await getLessonAccess(sb, params.lessonId)
    if (!access) return apiError('substage_not_found', 404)
    const canView = await hasEducationPrivilege(session, 'view_students', access.target)
    if (!canView) return apiError('forbidden', 403)

    // lesson_notes ещё не в сгенерированных типах.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .from('lesson_notes')
      .select('id, body, created_at, author_id')
      .eq('lesson_id', params.lessonId)
      .order('created_at', { ascending: false })
    if (error) {
      if ((error as { code?: string }).code === '42P01') return NextResponse.json({ notes: [] })
      throw error
    }

    const rows = (data ?? []) as Array<{ id: string; body: string; created_at: string; author_id: string | null }>
    const authorIds = [...new Set(rows.map(r => r.author_id).filter(Boolean) as string[])]
    const nameById = new Map<string, string>()
    if (authorIds.length > 0) {
      const { data: persons } = await sb.from('persons').select('id, full_name').in('id', authorIds)
      for (const p of (persons ?? []) as Array<{ id: string; full_name: string | null }>) nameById.set(p.id, p.full_name ?? '')
    }

    const notes = rows.map(r => ({ id: r.id, body: r.body, created_at: r.created_at, author: r.author_id ? nameById.get(r.author_id) ?? null : null }))
    return NextResponse.json({ notes })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { lessonId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()

    const access = await getLessonAccess(sb, params.lessonId)
    if (!access) return apiError('substage_not_found', 404)
    const canWrite = await hasEducationPrivilege(session, 'mark_attendance', access.target)
      || await hasEducationPrivilege(session, 'set_lesson_topics', access.target)
    if (!canWrite) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { body?: string }
    const text = (body.body ?? '').trim()
    if (!text) return apiError('note_required', 400)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb as any).from('lesson_notes').insert({
      lesson_id: params.lessonId, author_id: session.person_id, body: text.slice(0, 4000),
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
