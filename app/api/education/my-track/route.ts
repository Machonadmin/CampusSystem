import { NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'
import { errorResponse } from '@/lib/api/handler'
import { db, loadTrackCatalog, myManagedTrackIds } from '@/lib/education/track-managers'

/**
 * GET /api/education/my-track — маршруты, которые пользователь ведёт на экране
 * «המסלול שלי»: где он ответственный (study_track_managers), а superadmin и
 * manage_tracks — все активные. Пустой список = пункт меню не показывается.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = db()
    const catalog = await loadTrackCatalog(sb)
    const { ids, admin } = await myManagedTrackIds(sb, session, catalog)
    const set = new Set(ids)
    const tracks = catalog.filter(t => set.has(t.id))
      .map(t => ({ id: t.id, code: t.code, name_he: t.name_he, name_ru: t.name_ru, name_en: t.name_en }))
    return NextResponse.json({ tracks, admin })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
