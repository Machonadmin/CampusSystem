import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'
import { errorResponse, fetchAllPages, parseBody } from '@/lib/api/handler'
import { isMissingTable } from '@/lib/supabase/errors'
import {
  db, loadStudentTracks, loadTrackCatalog, myManagedTrackIds, type AnySB, type TrackFull,
} from '@/lib/education/track-managers'
import { planAddToTrack, planRemoveFromTrack } from '@/lib/education/track-picking'

/**
 * «המסלול שלי» — ответственный маршрута сам выбирает своих студенток.
 *
 * GET    → { track, students } — ВСЕ студентки института (education_status =
 *          'student') с их текущими светскими маршрутами; клиент ищет и
 *          отмечает. לימודי קודש здесь не участвуют.
 * POST   { journey_id } → добавить в маршрут по правилам lib/education/track-picking
 *          (главный, или дополнительный в паре טורו ↔ אוניברסיטה; чужую не забрать).
 * DELETE ?journey_id= → снять с ЭТОГО маршрута (если снят главный — оставшийся
 *          дополнительный становится главным).
 *
 * Право: ответственный этого маршрута, manage_tracks или superadmin.
 */

async function guard(trackId: string) {
  const session = await getSession()
  if (!session) return { error: apiError('unauthorized', 401) } as const
  const sb = db()
  const catalog = await loadTrackCatalog(sb)
  const track = catalog.find(t => t.id === trackId)
  if (!track) return { error: apiError('record_not_found', 404) } as const
  const { ids } = await myManagedTrackIds(sb, session, catalog)
  if (!ids.includes(trackId)) return { error: apiError('forbidden', 403) } as const
  return { session, sb, catalog, track } as const
}

async function isStudentJourney(sb: AnySB, journeyId: string): Promise<boolean> {
  const { data, error } = await sb.from('education_journeys')
    .select('id').eq('id', journeyId).eq('education_status', 'student').maybeSingle()
  if (error) throw error
  return !!data
}

function catalogMap(catalog: TrackFull[]) {
  return new Map(catalog.map(t => [t.id, t]))
}

export async function GET(_request: NextRequest, props: { params: Promise<{ trackId: string }> }) {
  const { trackId } = await props.params
  try {
    const g = await guard(trackId)
    if ('error' in g) return g.error
    const { sb, track } = g

    const journeys = await fetchAllPages<{
      id: string
      person: { full_name: string | null; hebrew_name: string | null } | null
      department: { id: string; name: string } | null
    }>((from, to) => sb.from('education_journeys')
      .select('id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name), department:departments!education_journeys_primary_department_id_fkey(id, name)')
      .eq('education_status', 'student')
      .order('id', { ascending: true })
      .range(from, to))

    const tracksBy = await loadStudentTracks(sb, journeys.map(j => j.id))
    const students = journeys
      .map(j => ({
        journey_id: j.id,
        name: j.person?.hebrew_name || j.person?.full_name || '',
        department: j.department ? { id: j.department.id, name: j.department.name } : null,
        tracks: tracksBy.get(j.id) ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'))

    return NextResponse.json({
      track: { id: track.id, code: track.code, name_he: track.name_he, name_ru: track.name_ru, name_en: track.name_en },
      catalog: g.catalog.map(t => ({ id: t.id, code: t.code, category: t.category ?? null, name_he: t.name_he, name_ru: t.name_ru, name_en: t.name_en })),
      students,
    })
  } catch (err: unknown) {
    if (isMissingTable(err)) return NextResponse.json({ track: null, catalog: [], students: [] })
    return errorResponse(err as { status?: number; message?: string })
  }
}

const addSchema = z.object({ journey_id: z.string().uuid() })

export async function POST(request: NextRequest, props: { params: Promise<{ trackId: string }> }) {
  const { trackId } = await props.params
  try {
    const body = await parseBody(request, addSchema)
    const g = await guard(trackId)
    if ('error' in g) return g.error
    const { sb, session, track, catalog } = g
    if (!(await isStudentJourney(sb, body.journey_id))) return apiError('record_not_found', 404)

    const rows = (await loadStudentTracks(sb, [body.journey_id])).get(body.journey_id) ?? []
    const plan = planAddToTrack(track, rows, catalogMap(catalog))
    if (plan.kind === 'already') return NextResponse.json({ ok: true, role: rows.find(r => r.track_id === trackId)?.role })
    if (plan.kind === 'blocked') {
      return apiError(plan.reason === 'two_tracks' ? 'my_track_two_tracks' : 'my_track_other_track', 409, { track_ids: plan.trackIds })
    }

    const { error } = await sb.from('journey_study_tracks').upsert({
      journey_id: body.journey_id,
      track_id: trackId,
      role: plan.role,
      completed_at: null,
      updated_by: session.person_id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'journey_id,track_id' })
    if (error) {
      if (isMissingTable(error)) return apiError('feature_not_migrated', 503)
      // Старый (завершённый) главный маршрут занимает «слот» главного.
      if (error.code === '23505') return apiError('my_track_other_track', 409)
      throw error
    }
    return NextResponse.json({ ok: true, role: plan.role })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ trackId: string }> }) {
  const { trackId } = await props.params
  try {
    const journeyId = new URL(request.url).searchParams.get('journey_id')
    if (!journeyId || !z.string().uuid().safeParse(journeyId).success) return apiError('invalid_reference', 400)
    const g = await guard(trackId)
    if ('error' in g) return g.error
    const { sb, session } = g

    const rows = (await loadStudentTracks(sb, [journeyId])).get(journeyId) ?? []
    const plan = planRemoveFromTrack(trackId, rows)
    if (plan.kind === 'not_in_track') return NextResponse.json({ ok: true })

    const { error: delErr } = await sb.from('journey_study_tracks').delete()
      .eq('journey_id', journeyId).eq('track_id', trackId)
    if (delErr) {
      if (isMissingTable(delErr)) return apiError('feature_not_migrated', 503)
      throw delErr
    }
    if (plan.promoteTrackId) {
      const { error: upErr } = await sb.from('journey_study_tracks')
        .update({ role: 'primary', updated_by: session.person_id, updated_at: new Date().toISOString() })
        .eq('journey_id', journeyId).eq('track_id', plan.promoteTrackId)
      if (upErr) console.error('[my-track] promote additional → primary:', upErr)
    }
    return NextResponse.json({ ok: true, promoted: plan.promoteTrackId })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
