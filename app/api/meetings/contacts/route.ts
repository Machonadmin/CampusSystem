import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { errorResponse } from '@/lib/api/handler'
import { db } from '@/lib/meetings/access'
import { groupsFor, isContactGroup, cleanPrivateContact, MAX_IMPORT_ROWS } from '@/lib/meetings/contacts'
import { addressBookAccess, listGroup } from '@/lib/meetings/contacts-server'

/**
 * ספר אנשי הקשר של המנהל.
 *
 * GET  ?group=students|staff|alumni|donors|private
 *   → { role, groups, contacts[] } — в списке ТОЛЬКО технические данные
 *     (имя, телефон, email, город, фото, подразделение, группа, год, מסלול),
 *     поэтому список одинаков для המנהל и מזכירת המנהל. Без group — только
 *     role/groups (что показать на экране).
 * POST { contacts: [...] } — добавить личные контакты (один или импорт из
 *   таблицы). Владелец — тот, кто добавляет. → { created, ids, skipped }
 */

export async function GET(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const sb = createServerClient()
    const acc = await addressBookAccess(sb, session)
    const groups = groupsFor(acc.role, acc.sharedWithMe)
    const group = request.nextUrl.searchParams.get('group')
    const meta = { role: acc.role, groups, migrated: acc.migrated, can_see_notes: acc.role === 'director' && acc.isSuperadmin }
    if (!group) return NextResponse.json({ ...meta, contacts: [] })
    if (!isContactGroup(group)) return apiError('meetings_invalid_input', 400)
    if (!groups.includes(group)) return apiError('forbidden', 403)
    if (group === 'private' && !acc.migrated) return NextResponse.json({ ...meta, contacts: [] })
    return NextResponse.json({ ...meta, contacts: await listGroup(sb, session, group) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const sb = createServerClient()
    const acc = await addressBookAccess(sb, session)
    if (!acc.role) return apiError('forbidden', 403)
    const body = await request.json().catch(() => ({})) as { contacts?: unknown }
    if (!Array.isArray(body.contacts) || body.contacts.length === 0) return apiError('meetings_invalid_input', 400)
    if (body.contacts.length > MAX_IMPORT_ROWS) return apiError('contacts_import_too_many', 400)

    const rows = body.contacts.map(cleanPrivateContact)
    const good = rows.filter((r): r is NonNullable<typeof r> => r !== null)
    if (good.length === 0) return apiError('meetings_invalid_input', 400)
    const insert = good.map(r => ({ ...r, owner_id: session.person_id, created_by: session.person_id }))
    const ids: string[] = []
    for (let i = 0; i < insert.length; i += 500) {
      const { data, error } = await db(sb).from('private_contacts').insert(insert.slice(i, i + 500)).select('id')
      if (error) throw error
      ids.push(...((data ?? []) as Array<{ id: string }>).map(r => r.id))
    }
    return NextResponse.json({ created: ids.length, ids, skipped: rows.length - good.length }, { status: 201 })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
