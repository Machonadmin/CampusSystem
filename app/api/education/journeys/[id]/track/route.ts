import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege, getEducationPrivilegeScope } from '@/lib/education/permissions'
import { journeyDeptTarget } from '@/lib/education/journey-target'

/**
 * Учебные маршруты студентки (spec §3.2): один ГЛАВНЫЙ (primary) + опциональные
 * дополнительные (additional, напр. Туро). Первая половина дня — иудаизм для всех
 * (кодеш, отдельное измерение), здесь — светские маршруты второй половины.
 *
 * GET  → { track, tracks } — `track` = primary-строка (обратная совместимость со
 *        StudyTrackPanel), `tracks` = все строки (primary + additional).
 *        Право: view_students.
 * PUT  → назначить/сменить одну строку. body { track_id, role?, notes?,
 *        year_level?, reactivate? }. role по умолчанию 'primary'. track_id=null
 *        со role='primary' снимает главный маршрут (удаляет строку). Право:
 *        manage_students.
 * DELETE?track_id= → снять один маршрут студентки. Право: manage_students.
 *
 * Deploy-safe: нет таблицы (42P01) → GET отдаёт пусто, запись — 200 no-op; нет
 * колонки role (42703, до миграции) → откат к прежней 1:1-модели по journey_id.
 */

type Role = 'primary' | 'additional'

async function requireManage(sb: ReturnType<typeof createServerClient>, journeyId: string) {
  const session = await getSession()
  if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  const target = await journeyDeptTarget(sb, journeyId)
  const allowed = session.roles.includes('superadmin')
    || (target
      ? await hasEducationPrivilege(session, 'manage_students', target)
      : (await getEducationPrivilegeScope(session, 'manage_students')) === 'all')
  if (!allowed) throw Object.assign(new Error(serverT('forbidden')), { status: 403 })
  return session
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()
    const allowed = session.roles.includes('superadmin')
      || await hasEducationPrivilege(session, 'view_students', await journeyDeptTarget(sb, params.id))
    if (!allowed) return apiError('forbidden', 403)

    // 1:N select. Deploy-safe: 42703 (нет role/year_level до миграции) → base select.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let { data, error } = await (sb
      .from('journey_study_tracks')
      .select('journey_id, track_id, role, notes, year_level, completed_at, updated_at')
      .eq('journey_id', params.id)
      .order('role', { ascending: true }) as any)
    if (error && error.code === '42703') {
      const base = await sb
        .from('journey_study_tracks')
        .select('journey_id, track_id, notes, updated_at')
        .eq('journey_id', params.id)
        .maybeSingle()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data = base.data ? [{ ...(base.data as any), role: 'primary' }] : []
      error = base.error
    }
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ track: null, tracks: [] })
      throw error
    }
    const rows = (data ?? []) as Array<Record<string, unknown> & { role?: string; track_id?: string | null }>
    const tracks = rows.filter(r => r.track_id)
    const primary = tracks.find(r => (r.role ?? 'primary') === 'primary') ?? null
    return NextResponse.json({ track: primary, tracks })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = createServerClient()
    const session = await requireManage(sb, params.id)

    const body = await request.json().catch(() => ({})) as {
      track_id?: string | null
      role?: string
      notes?: string | null
      year_level?: number
      reactivate?: boolean
    }
    const role: Role = body.role === 'additional' ? 'additional' : 'primary'
    const trackId = body.track_id ?? null
    const notes = body.notes && String(body.notes).trim() ? String(body.notes).trim().slice(0, 2000) : null

    // track_id=null + primary → снять главный маршрут (удаление строк primary).
    if (trackId === null) {
      if (role !== 'primary') return apiError('invalid_reference', 400)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (sb.from('journey_study_tracks').delete().eq('journey_id', params.id).eq('role', 'primary') as any)
      if (error && error.code === '42703') {
        // до миграции: legacy — снять весь маршрут (обнулить track_id).
        const legacy = await sb.from('journey_study_tracks')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert({ journey_id: params.id, track_id: null, updated_by: session.person_id, updated_at: new Date().toISOString() } as any, { onConflict: 'journey_id' })
        if (legacy.error && legacy.error.code !== '42P01') throw legacy.error
        return NextResponse.json({ ok: true })
      }
      if (error && error.code !== '42P01') throw error
      return NextResponse.json({ ok: true })
    }

    const payload: Record<string, unknown> = {
      journey_id: params.id,
      track_id: trackId,
      role,
      notes,
      updated_by: session.person_id,
      updated_at: new Date().toISOString(),
    }
    if (typeof body.year_level === 'number' && body.year_level >= 1 && body.year_level <= 8) {
      payload.year_level = body.year_level
    }
    if (body.reactivate) payload.completed_at = null

    // Ставим primary → сперва снимаем ДРУГИЕ primary-строки этой journey (не более
    // одного главного маршрута; partial-unique в БД это тоже гарантирует).
    if (role === 'primary') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: delErr } = await (sb.from('journey_study_tracks').delete()
        .eq('journey_id', params.id).eq('role', 'primary').neq('track_id', trackId) as any)
      if (delErr && delErr.code !== '42703' && delErr.code !== '42P01') throw delErr
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let { error } = await (sb.from('journey_study_tracks').upsert(payload as any, { onConflict: 'journey_id,track_id' }) as any)
    if (error && error.code === '42703') {
      // до миграции: legacy 1:1 upsert по journey_id.
      const legacy: Record<string, unknown> = {
        journey_id: params.id, track_id: trackId, notes, updated_by: session.person_id, updated_at: new Date().toISOString(),
      }
      const retry = await sb.from('journey_study_tracks')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(legacy as any, { onConflict: 'journey_id' })
      error = retry.error
    }
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ ok: true })
      if (error.code === '23503') return apiError('invalid_reference', 400)
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = createServerClient()
    await requireManage(sb, params.id)
    const trackId = new URL(request.url).searchParams.get('track_id')
    if (!trackId) return apiError('invalid_reference', 400)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from('journey_study_tracks').delete()
      .eq('journey_id', params.id).eq('track_id', trackId) as any)
    if (error && error.code !== '42P01') throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
