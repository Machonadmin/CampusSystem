import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { isChavrutaTeacher } from '@/lib/chavruta/teachers'
import { canViewStaffComp } from '@/lib/finance/staff-comp'

/**
 * Хавруты, которые мора записывает сама (кто с кем сидел сегодня).
 * Каждая сессия — строка staff_work_entries (entry_type='chavruta') с
 * person_id = морa, student_journey_id = ученица, amount = её chavruta_rate.
 *
 *   GET  ?date=YYYY-MM-DD → { sessions } — свои сессии за день (по умолч. сегодня).
 *                           Менеджер (view) может указать ?person_id=.
 *   POST → записать сессию { student_journey_id, entry_date?, summary?, private_notes? }.
 *          Только мора хавруты (гейт isChavrutaTeacher), person_id = она сама.
 * Деплой-безопасно (42P01).
 */
function u(sb: ReturnType<typeof createServerClient>) { return sb as unknown as SupabaseClient }

/** Карта journeyId → имя ученицы (для UI). Деплой-безопасно. */
async function studentNames(sb: ReturnType<typeof createServerClient>, journeyIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = [...new Set(journeyIds.filter(Boolean))]
  if (ids.length === 0) return out
  try {
    const { data } = await sb
      .from('education_journeys')
      .select('id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name)')
      .in('id', ids)
    for (const j of (data ?? []) as Array<{ id: string; person: { full_name?: string | null; hebrew_name?: string | null } | null }>) {
      const p = j.person
      out.set(j.id, (p?.full_name || p?.hebrew_name || '').trim())
    }
  } catch { /* ignore */ }
  return out
}

function todayISO(): string {
  const now = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)

    const sp = request.nextUrl.searchParams
    const date = (sp.get('date') ?? '').trim() || todayISO()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return apiError('invalid_reference', 400)

    const sb = createServerClient()
    // По умолчанию — свои сессии. Менеджер (view) может смотреть чужие через person_id.
    let personId = session.person_id
    const asked = (sp.get('person_id') ?? '').trim()
    if (asked && asked !== session.person_id) {
      if (!(await canViewStaffComp(session))) return apiError('forbidden', 403)
      personId = asked
    }

    try {
      const { data, error } = await u(sb).from('staff_work_entries')
        .select('id, entry_date, hours, amount, student_journey_id, summary, private_notes, created_at')
        .eq('person_id', personId).eq('entry_type', 'chavruta').eq('entry_date', date)
        .order('created_at', { ascending: true })
      if (error) throw error
      const rows = (data ?? []) as Array<{ id: string; student_journey_id: string | null; [k: string]: unknown }>
      const names = await studentNames(sb, rows.map(r => r.student_journey_id ?? ''))
      const sessions = rows.map(r => ({ ...r, student_name: names.get(r.student_journey_id ?? '') ?? '' }))
      return NextResponse.json({ sessions })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ sessions: [] })
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)

    const sb = createServerClient()
    if (!(await isChavrutaTeacher(sb, session.person_id))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as {
      student_journey_id?: string; entry_date?: string; summary?: string; private_notes?: string
    }
    const journeyId = (body.student_journey_id ?? '').trim()
    if (!journeyId) return apiError('invalid_reference', 400)
    const entryDate = (body.entry_date ?? '').trim() || todayISO()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return apiError('invalid_reference', 400)

    // Ставка хавруты моры (за сессию/час) — из staff_compensation.chavruta_rate.
    let amount: number | null = null
    try {
      const { data: rate } = await u(sb).from('staff_compensation').select('chavruta_rate').eq('person_id', session.person_id).maybeSingle()
      const r = Number((rate as { chavruta_rate?: number } | null)?.chavruta_rate ?? 0)
      amount = r > 0 ? r : null
    } catch { /* нет тарифа — null */ }

    const { data, error } = await u(sb).from('staff_work_entries')
      .insert({
        person_id: session.person_id,
        entry_type: 'chavruta',
        entry_date: entryDate,
        hours: null,
        amount,
        student_journey_id: journeyId,
        summary: (body.summary ?? '').trim() || null,
        private_notes: (body.private_notes ?? '').trim() || null,
        created_by: session.person_id,
      })
      .select('id, entry_date, hours, amount, student_journey_id, summary, private_notes, created_at')
      .single()
    if (error) {
      const code = (error as { code?: string }).code
      if (code === '42P01') return apiError('feature_not_migrated', 503)
      if (code === '23503') return apiError('invalid_reference', 400)
      throw error
    }
    return NextResponse.json({ session: data }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
