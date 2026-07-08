import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requirePsychologistPrivilege } from '@/lib/psychologist/permissions'
import { mapDbError } from '@/lib/psychologist/http'
import { isUpcomingFollowUp, isOverdueFollowUp, daysUntil } from '@/lib/psychologist/counseling'
import { todayISO } from '@/lib/psychologist/sessions-server'

/**
 * GET /api/psychologist/followups — worklist психолога: ОТКРЫТЫЕ консультации с
 *   датой контроля, разбитые на upcoming (сегодня и позже) и overdue (в прошлом)
 *   через чистые хелперы is*FollowUp. К каждой — имя студента. Право:
 *   psychologist.view. ЧУВСТВИТЕЛЬНЫЕ ДАННЫЕ.
 */

const PAGE = 1000

interface SessionRow {
  id: string
  journey_id: string
  session_date: string
  follow_up_date: string | null
  summary: string | null
  status: string
  journey: unknown
}

function studentName(row: SessionRow): { full_name: string; hebrew_name: string | null } {
  const j = row.journey as {
    person?: { full_name?: string | null; hebrew_name?: string | null } | null
  } | null
  return {
    full_name: j?.person?.full_name ?? '',
    hebrew_name: j?.person?.hebrew_name ?? null,
  }
}

export async function GET() {
  try {
    await requirePsychologistPrivilege('view')

    const sb = createServerClient()

    const rows: SessionRow[] = []
    let offset = 0
    for (;;) {
      const { data, error } = await sb
        .from('psych_sessions')
        .select(`
          id, journey_id, session_date, follow_up_date, summary, status,
          journey:education_journeys!psych_sessions_journey_id_fkey(
            id, person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name)
          )
        `)
        .eq('status', 'open')
        .not('follow_up_date', 'is', null)
        .order('follow_up_date', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      const batch = (data ?? []) as unknown as SessionRow[]
      rows.push(...batch)
      if (batch.length < PAGE) break
      offset += PAGE
    }

    const today = todayISO()

    const map = (r: SessionRow) => {
      const s = studentName(r)
      return {
        id: r.id,
        journey_id: r.journey_id,
        session_date: r.session_date,
        follow_up_date: r.follow_up_date,
        summary: r.summary,
        student_name: s.full_name,
        student_hebrew_name: s.hebrew_name,
        days_until: r.follow_up_date ? daysUntil(r.follow_up_date, today) : null,
      }
    }

    // status/follow_up_date уже отфильтрованы в SQL; хелперы дают чистое
    // разбиение (граница «сегодня» → upcoming, не overdue).
    const upcoming = rows.filter(r => isUpcomingFollowUp(r, today)).map(map)
    const overdue = rows.filter(r => isOverdueFollowUp(r, today)).map(map)

    return NextResponse.json({
      upcoming,
      overdue,
      counts: { upcoming: upcoming.length, overdue: overdue.length },
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
