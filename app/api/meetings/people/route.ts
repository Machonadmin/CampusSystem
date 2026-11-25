import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireModuleUser } from '@/lib/modules/personal-access'
import { errorResponse } from '@/lib/api/handler'
import { sanitizeOrSearch } from '@/lib/search/sanitize'
import { db, managedOwnerIds, delegateIdsOf } from '@/lib/meetings/access'
import { canUseMeetingPeople, meetingPeopleFilter } from '@/lib/meetings/people'

/**
 * GET /api/meetings/people?search=…|ids=… — выбор людей на экране «פגישות»
 * (участники, ответственные, кому открыть / передать, секретарь). Формат —
 * как у /api/persons, чтобы работал общий PersonSelect (source=…).
 *
 * Только для тех, кто ведёт календарь с секретарём (владелец, секретарь) и
 * для superadmin: у секретаря может не быть права «אנשים», а выбирать людей
 * ей нужно. Отдаются только имена сотрудников с учётной записью и студенток.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireModuleUser('meetings')
    const sb = createServerClient()
    const allowed = canUseMeetingPeople({
      isSuperadmin: session.roles.includes('superadmin'),
      managesOthers: (await managedOwnerIds(sb, session.person_id)).length > 0,
      hasDelegates: (await delegateIdsOf(sb, session.person_id)).length > 0,
    })
    if (!allowed) return apiError('forbidden', 403)

    const ids = (request.nextUrl.searchParams.get('ids') ?? '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 50)
    const q = sanitizeOrSearch(request.nextUrl.searchParams.get('search'))

    let qb = db(sb).from('persons').select('id, full_name, hebrew_name').order('full_name').limit(60)
    if (ids.length > 0) qb = qb.in('id', ids)
    else if (q.length >= 2) qb = qb.or(`full_name.ilike.%${q}%,hebrew_name.ilike.%${q}%`)
    const { data, error } = await qb
    if (error) throw error
    const rows = (data ?? []) as Array<{ id: string; full_name: string; hebrew_name: string | null }>
    if (rows.length === 0) return NextResponse.json({ people: [] })

    const pids = rows.map(r => r.id)
    const [{ data: acc }, { data: jr }] = await Promise.all([
      db(sb).from('person_accounts').select('person_id').in('person_id', pids).eq('is_active', true),
      db(sb).from('education_journeys').select('person_id').in('person_id', pids),
    ])
    const keep = meetingPeopleFilter(
      ((acc ?? []) as Array<{ person_id: string }>).map(r => r.person_id),
      ((jr ?? []) as Array<{ person_id: string }>).map(r => r.person_id),
    )
    return NextResponse.json({
      people: rows.filter(r => keep.has(r.id)).slice(0, 40)
        .map(r => ({ id: r.id, full_name: r.full_name, hebrew_name: r.hebrew_name })),
    })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
