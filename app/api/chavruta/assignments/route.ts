import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { fetchAllPages, errorResponse } from '@/lib/api/handler'
import { getSession } from '@/lib/auth/session'
import { canViewChavruta, canManageChavruta } from '@/lib/chavruta/access'
import type { JourneyStatus } from '@/types/database'
import { isMissingRelation, isMissingTable } from '@/lib/supabase/errors'
import { compareNames } from '@/lib/persons/name'

/**
 * Управляющая сводка пар хавруты (шиюх) для «мרכз חברותא» в модуле лимудим.
 *
 * Пары хранятся в chavruta_pairs. Решение владельца 2026-10-13 (заменяет #6,
 * по которому каждая пара оплачивалась помесячно как хеврута-плюс): хеврута
 * одна, оплата — за записанную встречу по chavruta_rate. Пара = «חברותא קבועה»
 * моры: ученица стоит в её журнале, и мора одной кнопкой отмечает каждую
 * встречу. Мора может отмечать/снимать «קבועה» и сама (/api/chavruta/recurring).
 *
 *   GET  → { assignments: [{ id, teacher_person_id, teacher_name,
 *            student_journey_id, student_name, weekday, start_time }],
 *            students: [{ journey_id, name }] }
 *          weekday/start_time — день и время встречи, их ставит мора (null — не
 *          задано или ещё нет миграции 20261013140000).
 *          Право: view chavruta (staff-comp ЛИБО manage_students). students —
 *          активные ученицы для пикера.
 *   POST → создать/реактивировать пару { teacher_person_id, student_journey_id }.
 *          Право: manage chavruta (staff-comp ЛИБО manage_students).
 * Деплой-безопасно (42P01 → пустая сводка).
 */

/** Карта personId/journeyId → имя (full_name ∥ hebrew_name). */
async function personNames(sb: ReturnType<typeof createServerClient>, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const uniq = [...new Set(ids.filter(Boolean))]
  if (uniq.length === 0) return out
  const { data } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', uniq)
  for (const p of (data ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) {
    out.set(p.id, (p.hebrew_name || p.full_name || '').trim())
  }
  return out
}

const STUDENT_LIFECYCLE: JourneyStatus[] = ['student', 'on_leave']

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canViewChavruta(session))) return apiError('forbidden', 403)

    const sb = createServerClient()

    // Активные ученицы (для пикера шиюх). Имя берём из связанного person.
    const students: Array<{ journey_id: string; name: string }> = []
    {
      const data = await fetchAllPages<unknown>((from, to) => sb
        .from('education_journeys')
        .select('id, education_status, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name)')
        .in('education_status', STUDENT_LIFECYCLE)
        .order('id', { ascending: true })
        .range(from, to))
      for (const j of data as Array<{ id: string; person: { full_name?: string | null; hebrew_name?: string | null } | null }>) {
        students.push({ journey_id: j.id, name: (j.person?.hebrew_name || j.person?.full_name || '').trim() })
      }
      students.sort((a, b) => compareNames(a.name, b.name))
    }

    // Активные пары.
    type PairRow = { id: string; teacher_person_id: string; student_journey_id: string; weekday: number | null; start_time: string | null }
    let rows: PairRow[] = []
    try {
      const { data, error } = await sb.from('chavruta_pairs')
        .select('id, teacher_person_id, student_journey_id, weekday, start_time')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
      if (error) throw error
      rows = (data ?? []) as PairRow[]
    } catch (e) {
      if (isMissingTable(e)) return NextResponse.json({ assignments: [], students })
      if (!isMissingRelation(e)) throw e
      // Колонок дня/времени ещё нет — пары без расписания.
      const { data, error } = await sb.from('chavruta_pairs')
        .select('id, teacher_person_id, student_journey_id')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
      if (error) throw error
      rows = ((data ?? []) as Array<Omit<PairRow, 'weekday' | 'start_time'>>).map(r => ({ ...r, weekday: null, start_time: null }))
    }

    const teacherNames = await personNames(sb, rows.map(r => r.teacher_person_id))
    const studentNameByJourney = new Map(students.map(s => [s.journey_id, s.name]))
    // Ученицы в парах могут быть вне активного набора (напр. выпускница) — добьём имена.
    const missingJourneys = rows.map(r => r.student_journey_id).filter(id => !studentNameByJourney.has(id))
    if (missingJourneys.length) {
      const { data } = await sb.from('education_journeys')
        .select('id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name)')
        .in('id', [...new Set(missingJourneys)])
      for (const j of (data ?? []) as Array<{ id: string; person: { full_name?: string | null; hebrew_name?: string | null } | null }>) {
        studentNameByJourney.set(j.id, (j.person?.hebrew_name || j.person?.full_name || '').trim())
      }
    }

    const assignments = rows.map(r => ({
      id: r.id,
      teacher_person_id: r.teacher_person_id,
      teacher_name: teacherNames.get(r.teacher_person_id) ?? '',
      student_journey_id: r.student_journey_id,
      student_name: studentNameByJourney.get(r.student_journey_id) ?? '',
      weekday: r.weekday,
      start_time: r.start_time,
    }))
    // По алфавиту: по море (первая колонка), внутри — по ученице.
    assignments.sort((a, b) => compareNames(a.teacher_name, b.teacher_name) || compareNames(a.student_name, b.student_name))

    return NextResponse.json({ assignments, students })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageChavruta(session))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { teacher_person_id?: string; student_journey_id?: string }
    const teacherId = (body.teacher_person_id ?? '').trim()
    const journeyId = (body.student_journey_id ?? '').trim()
    if (!teacherId || !journeyId) return apiError('invalid_reference', 400)

    const sb = createServerClient()
    const { data, error } = await sb.from('chavruta_pairs')
      .insert({ teacher_person_id: teacherId, student_journey_id: journeyId, is_active: true, created_by: session.person_id })
      .select('id, teacher_person_id, student_journey_id, is_active')
      .single()
    if (error) {
      const code = (error as { code?: string }).code
      if (isMissingTable(code)) return apiError('feature_not_migrated', 503)
      if (code === '23505') { // пара уже есть — реактивируем
        const { data: re, error: reErr } = await sb.from('chavruta_pairs')
          .update({ is_active: true }).eq('teacher_person_id', teacherId).eq('student_journey_id', journeyId)
          .select('id, teacher_person_id, student_journey_id, is_active').single()
        if (reErr) throw reErr
        return NextResponse.json({ assignment: re }, { status: 200 })
      }
      if (code === '23503') return apiError('invalid_reference', 400)
      throw error
    }
    return NextResponse.json({ assignment: data }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
