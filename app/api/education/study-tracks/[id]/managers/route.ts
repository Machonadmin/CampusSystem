import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/i18n/api-errors'
import { requireTracksCatalogPrivilege } from '@/lib/education/permissions'
import { jsonError, parseBody } from '@/lib/api/handler'
import { isMissingTable } from '@/lib/supabase/errors'
import { db } from '@/lib/education/track-managers'
import { personNames } from '@/lib/management/people'

/**
 * Ответственные маршрута (מנהלי מסלול) — они сами выбирают студенток на
 * «המסלול שלי». Право: manage_tracks (каталог маршрутов).
 *
 * GET → { managers: [{ id, name }] }
 * PUT { person_ids: string[] } → заменить список.
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  try {
    await requireTracksCatalogPrivilege()
    const sb = db()
    const { data, error } = await sb.from('study_track_managers').select('person_id').eq('track_id', id)
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ managers: [], not_migrated: true })
      throw error
    }
    const ids = ((data ?? []) as Array<{ person_id: string }>).map(r => r.person_id)
    const names = await personNames(sb, ids)
    return NextResponse.json({ managers: ids.map(pid => ({ id: pid, name: names.get(pid) ?? '—' })) })
  } catch (err: unknown) {
    return jsonError(err)
  }
}

const putSchema = z.object({ person_ids: z.array(z.string().uuid()).max(20) })

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  try {
    const body = await parseBody(request, putSchema)
    const session = await requireTracksCatalogPrivilege()
    const sb = db()
    const { error: delErr } = await sb.from('study_track_managers').delete().eq('track_id', id)
    if (delErr) {
      if (isMissingTable(delErr)) return apiError('feature_not_migrated', 503)
      throw delErr
    }
    const ids = [...new Set(body.person_ids)]
    if (ids.length > 0) {
      const { error } = await sb.from('study_track_managers')
        .insert(ids.map(pid => ({ track_id: id, person_id: pid, created_by: session.person_id })))
      if (error) {
        if (error.code === '23503') return apiError('invalid_reference', 400)
        throw error
      }
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
