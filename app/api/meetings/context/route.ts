import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { errorResponse } from '@/lib/api/handler'
import { db, managedOwnerIds, delegateIdsOf, requestTargetIds, personNames } from '@/lib/meetings/access'

/**
 * GET /api/meetings/context — с чем человек работает на экране «פגישות»:
 *   calendars       — свой календарь + календари, которые он ведёт (מזכירת המנהל);
 *   my_delegates    — кто ведёт МОЙ календарь;
 *   request_targets — кому можно отправить заявку на встречу;
 *   is_superadmin   — может назначать секретарей любому;
 *   migrated        — применена ли миграция 20261116150000 (иначе экран объясняет).
 */
export async function GET() {
  try {
    const session = await requireCalendarUser()
    const sb = createServerClient()

    const probe = await db(sb).from('calendar_delegates').select('owner_id').limit(1)
    const migrated = !probe.error

    const managed = migrated ? await managedOwnerIds(sb, session.person_id) : []
    const mine = migrated ? await delegateIdsOf(sb, session.person_id) : []
    const targets = migrated ? (await requestTargetIds(sb)).filter(id => id !== session.person_id) : []
    const names = await personNames(sb, [session.person_id, ...managed, ...mine, ...targets])

    return NextResponse.json({
      migrated,
      me: { id: session.person_id, name: names.get(session.person_id) ?? session.full_name ?? '' },
      calendars: [
        { owner_id: session.person_id, name: names.get(session.person_id) ?? '', role: 'owner' as const },
        ...managed.map(id => ({ owner_id: id, name: names.get(id) ?? '', role: 'delegate' as const })),
      ],
      my_delegates: mine.map(id => ({ id, name: names.get(id) ?? '' })),
      request_targets: targets.map(id => ({ id, name: names.get(id) ?? '' })),
      is_superadmin: session.roles.includes('superadmin'),
    })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
