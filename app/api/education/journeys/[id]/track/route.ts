import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import type { JourneyStudyTrackInsert } from '@/types/database'

/**
 * GET  /api/education/journeys/[id]/track — маршрут второй половины дня студентки
 *      + заметка (исключения). Право: view_students.
 * PUT  /api/education/journeys/[id]/track — назначить/сменить. Право: manage_students.
 *
 * Защищено к отсутствию таблицы (42P01): GET отдаёт null, PUT — 200 no-op, чтобы
 * деплой до миграции не ломал карточку студентки.
 */

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const allowed = session.roles.includes('superadmin') || await hasEducationPrivilege(session, 'view_students')
    if (!allowed) return apiError('forbidden', 403)

    const sb = createServerClient()
    const { data, error } = await sb
      .from('journey_study_tracks')
      .select('journey_id, track_id, notes, updated_at')
      .eq('journey_id', params.id)
      .maybeSingle()
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ track: null })
      throw error
    }
    return NextResponse.json({ track: data ?? null })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const allowed = session.roles.includes('superadmin') || await hasEducationPrivilege(session, 'manage_students')
    if (!allowed) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { track_id?: string | null; notes?: string | null }

    const row: JourneyStudyTrackInsert = {
      journey_id: params.id,
      track_id: body.track_id ?? null,
      notes: (body.notes ?? null) && String(body.notes).trim() ? String(body.notes).trim().slice(0, 2000) : null,
      updated_by: session.person_id,
    }

    const sb = createServerClient()
    const { error } = await sb
      .from('journey_study_tracks')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert({ ...row, updated_at: new Date().toISOString() } as any, { onConflict: 'journey_id' })
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ ok: true }) // таблицы ещё нет
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
