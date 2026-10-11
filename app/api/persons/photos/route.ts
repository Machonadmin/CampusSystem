import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/api/handler'
import { requirePersonsPrivilege, hasPersonsPrivilege } from '@/lib/persons/permissions'
import { parsePersonIds } from '@/lib/persons/profile-photos'
import { loadProfilePhotoUrls } from '@/lib/persons/profile-photos-storage'

/**
 * GET /api/persons/photos?ids=<person_id>,<person_id>,…
 *
 * Фото профиля для кружков у имени («מאגר האנשים» и карточка человека):
 * последнее активное «תמונת פרופיל» из документов каждого человека.
 *
 * Право: persons.view — сам экран; фото — только с persons.view_photos
 * (superadmin проходит всегда). Без него ответ { enabled: false } — клиент
 * больше не спрашивает и показывает инициалы. GET, а не POST: в режиме
 * «צפייה כמשתמש» изменяющие запросы закрыты, а чтение — нет.
 *
 * Ответ: { enabled: boolean, photos: { [person_id]: signedUrl } }
 */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await requirePersonsPrivilege('view')
    if (!(await hasPersonsPrivilege(session, 'view_photos'))) {
      return NextResponse.json({ enabled: false, photos: {} }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const ids = parsePersonIds(request.nextUrl.searchParams.get('ids'))
    const photos = await loadProfilePhotoUrls(ids)
    return NextResponse.json({ enabled: true, photos }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
