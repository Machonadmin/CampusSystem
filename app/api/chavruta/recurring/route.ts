import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { isChavrutaTeacher } from '@/lib/chavruta/teachers'
import { parseSchedule } from '@/lib/chavruta/schedule'
import { isIsoDate } from '@/lib/dates'
import { isMissingRelation, isMissingTable } from '@/lib/supabase/errors'
import { errorResponse } from '@/lib/api/handler'

/**
 * «חברותות קבועות» моры — её постоянные ученицы (решение владельца 2026-10-13:
 * одна хеврута с одним тарифом за встречу; «קבועה» мора отмечает сама, и это
 * только избавляет её от повторного ввода каждую неделю — на деньги не влияет).
 *
 * Хранится в chavruta_pairs (те же пары, что ведёт «מרכז חברותא»): пара =
 * ученица в списке «קבועות» у моры, с днём недели и временем встречи
 * (weekday/start_time — по ним утром напоминание и после встречи вопрос, см.
 * lib/chavruta/schedule.ts). Оплата — только за записанную встречу
 * (staff_work_entries, entry_type='chavruta', amount = chavruta_rate).
 *
 *   GET ?date= → { recurring: [{ id, student_journey_id, student_name, weekday,
 *                start_time, skipped }], schedule_supported } — свои пары;
 *                skipped — мора ответила «не состоялась» на эту дату.
 *   POST → отметить ученицу как «קבועה» { student_journey_id, weekday?, start_time? }
 *          (или вернуть снятую).
 * Только мора хавруты (гейт isChavrutaTeacher), teacher_person_id = она сама.
 * Снятие, день/время, ответ «не состоялась» — /api/chavruta/recurring/[id]/…
 * Деплой-безопасно: до миграции 20261013140000 — без дня и времени
 * (schedule_supported: false), до таблицы пар — пусто.
 */

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)

    const sb = createServerClient()
    if (!(await isChavrutaTeacher(sb, session.person_id))) return apiError('forbidden', 403)

    const date = (request.nextUrl.searchParams.get('date') ?? '').trim()
    if (date && !isIsoDate(date)) return apiError('invalid_reference', 400)

    type Row = { id: string; student_journey_id: string; weekday: number | null; start_time: string | null }
    let rows: Row[] = []
    let scheduleSupported = true
    try {
      const { data, error } = await sb.from('chavruta_pairs')
        .select('id, student_journey_id, weekday, start_time')
        .eq('teacher_person_id', session.person_id).eq('is_active', true)
        .order('created_at', { ascending: true })
      if (error) throw error
      rows = (data ?? []) as Row[]
    } catch (e) {
      if (isMissingTable(e)) return NextResponse.json({ recurring: [], schedule_supported: false })
      if (!isMissingRelation(e)) throw e
      // Колонок дня/времени ещё нет — список без расписания.
      scheduleSupported = false
      const { data, error } = await sb.from('chavruta_pairs')
        .select('id, student_journey_id')
        .eq('teacher_person_id', session.person_id).eq('is_active', true)
        .order('created_at', { ascending: true })
      if (error) throw error
      rows = ((data ?? []) as Array<{ id: string; student_journey_id: string }>).map(r => ({ ...r, weekday: null, start_time: null }))
    }

    const skipped = new Set<string>()
    if (date && scheduleSupported && rows.length) {
      const { data, error } = await sb.from('chavruta_skips')
        .select('pair_id').in('pair_id', rows.map(r => r.id)).eq('skip_date', date)
      if (error && !isMissingRelation(error)) throw error
      for (const r of data ?? []) skipped.add(r.pair_id)
    }

    const nameById = new Map<string, string>()
    const journeyIds = [...new Set(rows.map(r => r.student_journey_id))]
    if (journeyIds.length) {
      const { data: js } = await sb.from('education_journeys')
        .select('id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name)')
        .in('id', journeyIds)
      for (const j of (js ?? []) as Array<{ id: string; person: { full_name?: string | null; hebrew_name?: string | null } | null }>) {
        nameById.set(j.id, (j.person?.hebrew_name || j.person?.full_name || '').trim())
      }
    }

    const recurring = rows
      .map(r => ({
        id: r.id,
        student_journey_id: r.student_journey_id,
        student_name: nameById.get(r.student_journey_id) ?? '',
        weekday: r.weekday,
        start_time: r.start_time,
        skipped: skipped.has(r.id),
      }))
      .sort((a, b) => a.student_name.localeCompare(b.student_name, 'he'))
    return NextResponse.json({ recurring, schedule_supported: scheduleSupported })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)

    const sb = createServerClient()
    if (!(await isChavrutaTeacher(sb, session.person_id))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { student_journey_id?: string; weekday?: unknown; start_time?: unknown }
    const journeyId = (body.student_journey_id ?? '').trim()
    if (!journeyId) return apiError('invalid_reference', 400)
    const schedule = parseSchedule(body)
    if (!schedule) return apiError('invalid_reference', 400)

    // До миграции дня/времени — отмечаем «קבועה» без них (schedule_saved: false).
    const save = async (withSchedule: boolean) => {
      const extra = withSchedule ? schedule : {}
      const { data, error } = await sb.from('chavruta_pairs')
        .insert({ teacher_person_id: session.person_id, student_journey_id: journeyId, is_active: true, created_by: session.person_id, ...extra })
        .select('id, student_journey_id')
        .single()
      if (!error) return { data, status: 201 }
      if ((error as { code?: string }).code !== '23505') return { error }
      // Пара уже есть (возможно, снятая или заведённая в центре) — возвращаем.
      const { data: re, error: reErr } = await sb.from('chavruta_pairs')
        .update({ is_active: true, ...extra })
        .eq('teacher_person_id', session.person_id).eq('student_journey_id', journeyId)
        .select('id, student_journey_id').single()
      return reErr ? { error: reErr } : { data: re, status: 200 }
    }

    let scheduleSaved = true
    let res = await save(true)
    if (res.error && isMissingRelation(res.error) && !isMissingTable(res.error)) {
      scheduleSaved = false
      res = await save(false)
    }
    if (res.error) {
      const code = (res.error as { code?: string }).code
      if (isMissingTable(code)) return apiError('feature_not_migrated', 503)
      if (code === '23503') return apiError('invalid_reference', 400)
      throw res.error
    }
    return NextResponse.json({ recurring: res.data, schedule_saved: scheduleSaved }, { status: res.status })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
