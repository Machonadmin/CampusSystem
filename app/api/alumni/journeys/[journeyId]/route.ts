import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasAlumniPrivilege } from '@/lib/alumni/permissions'
import { parseAlumniInput, mergeAddress } from '@/lib/alumni/input'
import { errorResponse } from '@/lib/api/handler'

/**
 * /api/alumni/journeys/[journeyId] — правка и удаление выпускницы из карточки.
 * [journeyId] — education_journeys.id (тот же id, что в адресе карточки).
 *
 * PATCH  — любые поля формы выпускницы: личные (persons: ФИО, еврейское имя,
 *          дата рождения, телефоны, email, страна/город) и поля выпуска
 *          (alumni_profiles: год, рамка, программа, сейчас, заметки) и год
 *          поступления (education_journeys.year_start).
 *          Меняется только присланное. Профиля нет — создаётся.
 * DELETE — мягкое удаление дела выпускницы (is_deleted=true, кто/когда), как
 *          удаление лида. Человек и его история остаются в базе; из списка и
 *          по прямой ссылке выпускница больше не открывается.
 *
 * Право: alumni.manage (выдаётся в «אבטחת מידע» → «בוגרות» → «ניהול בוגרות»).
 */

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '22P02') return { status: 400, message: serverT('invalid_id') }
  return { status: 500, message: serverT('db_error') }
}

type Ctx = { params: Promise<{ journeyId: string }> }

async function loadGraduate(sb: ReturnType<typeof createServerClient>, journeyId: string) {
  const { data, error } = await sb
    .from('education_journeys')
    .select('id, person_id, education_status, is_deleted')
    .eq('id', journeyId)
    .maybeSingle()
  if (error) throw error
  if (!data || data.is_deleted || data.education_status !== 'graduated') return null
  return data as { id: string; person_id: string }
}

export async function PATCH(request: NextRequest, props: Ctx) {
  const { journeyId } = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await hasAlumniPrivilege(session, 'manage'))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({}))
    const parsed = parseAlumniInput(body, 'update')
    if (!parsed.ok) return apiError(`alumni_${parsed.error}`, 400)
    const { person, address, profile, journey } = parsed

    const sb = createServerClient({ actorPersonId: session.person_id })
    const j = await loadGraduate(sb, journeyId)
    if (!j) return apiError('alumni_profile_not_found', 404)

    const personPatch: Record<string, unknown> = { ...person }
    if (address) {
      const { data: cur, error: curErr } = await sb
        .from('persons').select('address').eq('id', j.person_id).maybeSingle()
      if (curErr) throw curErr
      personPatch.address = mergeAddress(cur?.address ?? null, address)
    }
    if (Object.keys(personPatch).length > 0) {
      const { error } = await sb
        .from('persons')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(personPatch as any)
        .eq('id', j.person_id)
      if (error) throw error
    }

    if (Object.keys(journey).length > 0) {
      const { error } = await sb
        .from('education_journeys')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(journey as any)
        .eq('id', j.id)
      if (error) throw error
    }

    if (Object.keys(profile).length > 0) {
      const { data: existing, error: exErr } = await sb
        .from('alumni_profiles').select('id').eq('person_id', j.person_id).maybeSingle()
      if (exErr) throw exErr
      const { error } = existing
        ? await sb.from('alumni_profiles')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update(profile as any).eq('id', existing.id)
        : await sb.from('alumni_profiles')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .insert({ person_id: j.person_id, ...profile } as any)
      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) return errorResponse(mapDbError(e))
    return errorResponse(e)
  }
}

export async function DELETE(_request: NextRequest, props: Ctx) {
  const { journeyId } = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await hasAlumniPrivilege(session, 'manage'))) return apiError('forbidden', 403)

    const sb = createServerClient({ actorPersonId: session.person_id })
    const j = await loadGraduate(sb, journeyId)
    if (!j) return apiError('alumni_profile_not_found', 404)

    const { error } = await sb
      .from('education_journeys')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: session.person_id } as any)
      .eq('id', journeyId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) return errorResponse(mapDbError(e))
    return errorResponse(e)
  }
}
