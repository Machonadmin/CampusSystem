import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireModuleUser } from '@/lib/modules/personal-access'
import { errorResponse } from '@/lib/api/handler'
import { hasOverlappingAppointment, overlappingLesson } from '@/lib/calendar/overlap'
import { isAppointmentStatus } from '@/lib/calendar/validation'
import { db, loadMeeting, personNames } from '@/lib/meetings/access'
import { attendeesFor, studentsFor } from '@/lib/meetings/server'
import { redactMeeting, cleanText, isValidRange } from '@/lib/meetings/rules'
import { meetingsError } from '@/lib/meetings/http'

/**
 * GET   /api/meetings/[id] — встреча со всем, что этому человеку положено:
 *   всем (кто видит встречу): тема, время, статус, участники, ссылки на תיק;
 *   подготовка (владелец, секретарь): חומר הכנה, документы;
 *   содержание (владелец, кому открыто): פירוט, סיכום, החלטות ומשימות;
 *   только владелец: הערה חסויה, кому открыто, что и кому передано.
 * PATCH /api/meetings/[id] — правка в пределах прав (см. lib/meetings/rules.ts).
 */

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params
    const session = await requireModuleUser('meetings')
    const sb = createServerClient()
    const m = await loadMeeting(sb, session, id)
    if (!m) return apiError('meeting_not_found', 404)
    const v = m.visibility

    const [att, students] = await Promise.all([attendeesFor(sb, [id]), studentsFor(sb, [m.row.journey_id])])
    const attendees = att.get(id) ?? []

    // Для ссылки «פתיחת התיק»: у кого из участников есть учебный путь.
    const pids = attendees.map(a => a.person_id)
    const journeyByPerson = new Map<string, string>()
    if (pids.length > 0) {
      const { data } = await db(sb).from('education_journeys').select('id, person_id').in('person_id', pids)
      for (const j of (data ?? []) as Array<{ id: string; person_id: string }>) journeyByPerson.set(j.person_id, j.id)
    }

    let items: unknown[] = []
    if (v.content) {
      const { data } = await db(sb).from('appointment_action_items')
        .select('id, kind, text, assignee_id, due_date, task_id, sort_order, created_at')
        .eq('appointment_id', id).order('sort_order').order('created_at')
      const rows = (data ?? []) as Array<{ id: string; assignee_id: string | null; task_id: string | null }>
      const names = await personNames(sb, rows.map(r => r.assignee_id))
      const taskIds = rows.map(r => r.task_id).filter((x): x is string => !!x)
      const statusById = new Map<string, string>()
      if (taskIds.length > 0) {
        const { data: tasks } = await db(sb).from('tasks').select('id, status').in('id', taskIds)
        for (const t of (tasks ?? []) as Array<{ id: string; status: string }>) statusById.set(t.id, t.status)
      }
      items = rows.map(r => ({
        ...r,
        assignee_name: r.assignee_id ? names.get(r.assignee_id) ?? '' : null,
        task_status: r.task_id ? statusById.get(r.task_id) ?? null : null,
      }))
    }

    let viewers: unknown[] = []
    let shares: unknown[] = []
    if (m.relation.isOwner) {
      const [{ data: vr }, { data: sh }] = await Promise.all([
        db(sb).from('appointment_content_viewers').select('person_id').eq('appointment_id', id),
        db(sb).from('appointment_shares').select('id, recipient_id, content, created_at, read_at').eq('appointment_id', id).order('created_at'),
      ])
      const vRows = (vr ?? []) as Array<{ person_id: string }>
      const sRows = (sh ?? []) as Array<{ recipient_id: string }>
      const names = await personNames(sb, [...vRows.map(r => r.person_id), ...sRows.map(r => r.recipient_id)])
      viewers = vRows.map(r => ({ id: r.person_id, name: names.get(r.person_id) ?? '' }))
      shares = sRows.map(r => ({ ...r, recipient_name: names.get(r.recipient_id) ?? '' }))
    }

    let documents: unknown[] = []
    if (v.prep) {
      const { data } = await db(sb).from('appointment_documents')
        .select('id, file_name, mime_type, size_bytes, created_at').eq('appointment_id', id).order('created_at')
      documents = data ?? []
    }

    const names = await personNames(sb, [m.row.provider_id])
    const st = m.row.journey_id ? students.get(m.row.journey_id) : undefined

    return NextResponse.json({
      meeting: redactMeeting(m.row, v),
      owner_name: names.get(m.row.provider_id) ?? '',
      visibility: v,
      attendees: attendees.map(a => ({ ...a, journey_id: journeyByPerson.get(a.person_id) ?? null })),
      student: st ? { journey_id: m.row.journey_id, person_id: st.person_id, name: st.name } : null,
      items,
      viewers,
      shares,
      documents,
    })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params
    const session = await requireModuleUser('meetings')
    const sb = createServerClient()
    const m = await loadMeeting(sb, session, id)
    if (!m) return apiError('meeting_not_found', 404)
    const v = m.visibility
    const body = await request.json().catch(() => ({})) as Record<string, unknown>

    const patch: Record<string, unknown> = {}
    const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)

    // Расписание: владелец или секретарь.
    if (has('title') || has('starts_at') || has('ends_at') || has('status')) {
      if (!v.manageSchedule) return apiError('forbidden', 403)
      if (has('title')) {
        const t = cleanText(body.title, 300)
        if (!t) return meetingsError(t === undefined ? 'invalid_input' : 'subject_required')
        patch.title = t
      }
      if (has('status')) {
        if (!isAppointmentStatus(body.status)) return apiError('invalid_status', 400)
        patch.status = body.status
      }
      if (has('starts_at') || has('ends_at')) {
        const starts = (body.starts_at ?? m.row.starts_at.slice(0, 16)) as string
        const ends = (body.ends_at ?? m.row.ends_at.slice(0, 16)) as string
        if (!isValidRange(starts, ends)) return meetingsError('invalid_time')
        const owner = m.row.provider_id
        const { data: block } = await db(sb).from('calendar_blocks').select('id').eq('provider_id', owner).eq('block_date', starts.slice(0, 10)).maybeSingle()
        if (block) return meetingsError('blocked')
        if (await hasOverlappingAppointment(sb, owner, starts, ends, id)) return meetingsError('overlap')
        const lesson = await overlappingLesson(sb, owner, starts, ends)
        if (lesson) return meetingsError('lesson', lesson.time)
        patch.starts_at = starts
        patch.ends_at = ends
      }
    }

    // Подготовка: владелец или секретарь.
    if (has('prep_notes')) {
      if (!v.prep) return apiError('forbidden', 403)
      const p = cleanText(body.prep_notes, 4000)
      if (p === undefined) return meetingsError('invalid_input')
      patch.prep_notes = p
    }

    // Содержание и הערה חסויה: только владелец.
    for (const [k, max] of [['reason', 4000], ['notes', 10000], ['summary', 20000], ['private_note', 20000]] as const) {
      if (!has(k)) continue
      if (!v.manageContent) return apiError('forbidden', 403)
      const val = cleanText(body[k], max)
      if (val === undefined) return meetingsError('invalid_input')
      patch[k] = val
    }

    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true })
    const { error } = await db(sb).from('appointments').update(patch).eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
