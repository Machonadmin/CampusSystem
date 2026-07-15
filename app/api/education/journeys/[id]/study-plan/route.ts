import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { journeyDeptTarget } from '@/lib/education/journey-target'

/**
 * Учебный план студентки: קבוצת כניסה (entry_group) + משך לימודים
 * (expected_duration_years). Выбирает ОТВЕТСТВЕННЫЙ руководитель.
 *
 * GET — право view_students. PUT — право manage_students.
 * Защищено к отсутствию таблицы (42P01): GET → null, PUT → 200 no-op, чтобы
 * деплой до миграции не ломал карточку студентки.
 */

const ENTRY_GROUPS = ['after_9', 'above_11'] as const
const DURATIONS = [2, 3, 4] as const

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()
    const allowed = session.roles.includes('superadmin')
      || await hasEducationPrivilege(session, 'view_students', await journeyDeptTarget(sb, params.id))
    if (!allowed) return apiError('forbidden', 403)

    const { data, error } = await sb
      .from('journey_study_plans')
      .select('journey_id, entry_group, expected_duration_years, updated_at')
      .eq('journey_id', params.id)
      .maybeSingle()
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ plan: null })
      throw error
    }
    return NextResponse.json({ plan: data ?? null })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()
    const allowed = session.roles.includes('superadmin')
      || await hasEducationPrivilege(session, 'manage_students', await journeyDeptTarget(sb, params.id))
    if (!allowed) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { entry_group?: string | null; expected_duration_years?: number | null }

    const entryGroup = body.entry_group ?? null
    if (entryGroup !== null && !(ENTRY_GROUPS as readonly string[]).includes(entryGroup)) {
      return apiError('invalid_field_value_status', 400)
    }
    const durRaw = body.expected_duration_years
    const duration = durRaw === null || durRaw === undefined ? null : Number(durRaw)
    if (duration !== null && !(DURATIONS as readonly number[]).includes(duration)) {
      return apiError('invalid_field_value_status', 400)
    }

    const { error } = await sb
      .from('journey_study_plans')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert({
        journey_id: params.id,
        entry_group: entryGroup,
        expected_duration_years: duration,
        updated_by: session.person_id,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: 'journey_id' })
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
