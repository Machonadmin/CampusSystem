import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canViewStaffComp, canManageStaffComp, monthRange } from '@/lib/finance/staff-comp'

/**
 * Шаббат-приёмы сотрудника (событие = оплата за событие + отмеченные ученицы).
 *   GET  ?year&month → { events: [{ id, entry_type, entry_date, amount, summary,
 *                        private_notes, attendees:[{journey_id,name}] }] } (view).
 *   POST → создать событие { entry_type(shabbat_host|shabbat_family), entry_date,
 *          amount, summary?, private_notes?, attendee_journey_ids:[] } (manage).
 * Сумму за событие задаёт менеджер. Деплой-безопасно (42P01).
 */
const SHABBAT_TYPES = ['shabbat_host', 'shabbat_family']
function u(sb: ReturnType<typeof createServerClient>) { return sb as unknown as SupabaseClient }

async function namesByJourney(sb: ReturnType<typeof createServerClient>, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const uniq = [...new Set(ids.filter(Boolean))]
  if (uniq.length === 0) return out
  const { data } = await sb.from('education_journeys')
    .select('id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name)')
    .in('id', uniq)
  for (const j of (data ?? []) as Array<{ id: string; person: { full_name?: string | null; hebrew_name?: string | null } | null }>) {
    out.set(j.id, (j.person?.full_name || j.person?.hebrew_name || '').trim())
  }
  return out
}

export async function GET(request: NextRequest, { params }: { params: { personId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canViewStaffComp(session))) return apiError('forbidden', 403)

    const sp = request.nextUrl.searchParams
    const year = Number(sp.get('year')), month = Number(sp.get('month'))
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return apiError('invalid_reference', 400)
    const { from, to } = monthRange(year, month)

    const sb = createServerClient()
    let events: Array<{ id: string; entry_type: string; entry_date: string; amount: number | null; summary: string | null; private_notes: string | null }>
    try {
      const { data, error } = await u(sb).from('staff_work_entries')
        .select('id, entry_type, entry_date, amount, summary, private_notes')
        .eq('person_id', params.personId).in('entry_type', SHABBAT_TYPES)
        .gte('entry_date', from).lte('entry_date', to)
        .order('entry_date', { ascending: false })
      if (error) throw error
      events = (data ?? []) as typeof events
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ events: [] })
      throw e
    }
    if (events.length === 0) return NextResponse.json({ events: [] })

    // Отмеченные ученицы по каждому событию.
    const eventIds = events.map(e => e.id)
    const attByEvent = new Map<string, string[]>()
    try {
      const { data: att } = await u(sb).from('staff_event_attendees')
        .select('work_entry_id, student_journey_id').in('work_entry_id', eventIds)
      for (const r of (att ?? []) as Array<{ work_entry_id: string; student_journey_id: string }>) {
        const arr = attByEvent.get(r.work_entry_id) ?? []
        arr.push(r.student_journey_id); attByEvent.set(r.work_entry_id, arr)
      }
    } catch (e) { if ((e as { code?: string }).code !== '42P01') throw e }

    const nameById = await namesByJourney(sb, [...attByEvent.values()].flat())
    const out = events.map(e => ({
      ...e,
      attendees: (attByEvent.get(e.id) ?? []).map(jid => ({ journey_id: jid, name: nameById.get(jid) ?? '' })),
    }))
    return NextResponse.json({ events: out })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { personId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageStaffComp(session))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as {
      entry_type?: string; entry_date?: string; amount?: number
      summary?: string; private_notes?: string; attendee_journey_ids?: string[]
    }
    if (!body.entry_type || !SHABBAT_TYPES.includes(body.entry_type)) return apiError('invalid_reference', 400)
    const entryDate = (body.entry_date ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return apiError('invalid_reference', 400)
    const amount = Number.isFinite(Number(body.amount)) && Number(body.amount) >= 0 ? Number(body.amount) : null
    const attendees = [...new Set((body.attendee_journey_ids ?? []).filter(Boolean))]

    const sb = createServerClient()
    // Событие (оплата).
    const { data: entry, error } = await u(sb).from('staff_work_entries')
      .insert({
        person_id: params.personId, entry_type: body.entry_type, entry_date: entryDate,
        hours: null, amount, student_journey_id: null,
        summary: (body.summary ?? '').trim() || null,
        private_notes: (body.private_notes ?? '').trim() || null,
        created_by: session.person_id,
      })
      .select('id, entry_type, entry_date, amount, summary, private_notes')
      .single()
    if (error) {
      if ((error as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      throw error
    }
    const eventId = (entry as { id: string }).id

    // Отмеченные ученицы.
    if (attendees.length) {
      const rows = attendees.map(jid => ({ work_entry_id: eventId, student_journey_id: jid }))
      const { error: aErr } = await u(sb).from('staff_event_attendees').insert(rows)
      if (aErr) {
        const code = (aErr as { code?: string }).code
        // Таблица участниц ещё не мигрирована — событие/оплата уже созданы; сообщим 503.
        if (code === '42P01') return apiError('feature_not_migrated', 503)
        if (code !== '23505' && code !== '23503') throw aErr
      }
    }

    return NextResponse.json({ event: entry }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
