import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { journeyDeptTarget } from '@/lib/education/journey-target'
import { shapeEventForViewer } from '@/lib/staff-comp/event-view'

/**
 * GET /api/education/journeys/[id]/shabbat
 *
 * Шаббат-приёмы, на которых была ученица: дата + кто принимал (сотрудник) + тип
 * + что было (summary). Синхронизация видна ученице (портал) и персоналу карточки.
 *
 * ПРИВАТНОСТЬ: private_notes (личное резюме сотрудника) — ученице НИКОГДА; среди
 * персонала: менеджер (manage_students / superadmin) и сам автор (сотрудник,
 * принимавший). Деплой-безопасно (42P01).
 */
function u(sb: ReturnType<typeof createServerClient>) { return sb as unknown as SupabaseClient }

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()

    let canSeeAnyPrivate = false
    let viewerPersonId: string | null = null
    if (session.principal === 'student') {
      if (session.student_journey_id !== params.id) return apiError('forbidden', 403)
    } else {
      const target = await journeyDeptTarget(sb, params.id)
      const isSuper = session.roles.includes('superadmin')
      const allowed = isSuper || await hasEducationPrivilege(session, 'view_students', target)
      if (!allowed) return apiError('forbidden', 403)
      canSeeAnyPrivate = isSuper || await hasEducationPrivilege(session, 'manage_students', target)
      viewerPersonId = session.person_id
    }

    // Через какие события она отмечена.
    let entryIds: string[]
    try {
      const { data, error } = await u(sb).from('staff_event_attendees')
        .select('work_entry_id').eq('student_journey_id', params.id)
      if (error) throw error
      entryIds = [...new Set(((data ?? []) as Array<{ work_entry_id: string }>).map(r => r.work_entry_id))]
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ events: [] })
      throw e
    }
    if (entryIds.length === 0) return NextResponse.json({ events: [] })

    let rows: Array<{ id: string; entry_type: string; entry_date: string | null; summary: string | null; private_notes: string | null; person_id: string }>
    try {
      const { data, error } = await u(sb).from('staff_work_entries')
        .select('id, entry_type, entry_date, summary, private_notes, person_id')
        .in('id', entryIds).in('entry_type', ['shabbat_host', 'shabbat_family'])
        .order('entry_date', { ascending: false })
      if (error) throw error
      rows = (data ?? []) as typeof rows
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ events: [] })
      throw e
    }

    // Имена принимавших сотрудников.
    const hostIds = [...new Set(rows.map(r => r.person_id).filter(Boolean))]
    const hostName = new Map<string, string>()
    if (hostIds.length) {
      const { data: ps } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', hostIds)
      for (const p of (ps ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) {
        hostName.set(p.id, (p.full_name || p.hebrew_name || '').trim())
      }
    }

    const events = rows.map(r => shapeEventForViewer({
      id: r.id,
      entry_date: r.entry_date,
      entry_type: r.entry_type,
      host_name: hostName.get(r.person_id) ?? '',
      summary: r.summary,
      private_notes: r.private_notes,
    }, { canSeePrivate: canSeeAnyPrivate || (viewerPersonId != null && r.person_id === viewerPersonId) }))

    return NextResponse.json({ events })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
