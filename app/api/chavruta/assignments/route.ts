import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canViewChavruta, canManageChavruta } from '@/lib/chavruta/access'
import type { JourneyStatus } from '@/types/database'

/**
 * Управляющая сводка пар хавруты (шиюх) для «мרכз חברותא» в модуле лимудим.
 *
 * Пары хранятся в chavruta_pairs — ОТДЕЛЬНОЙ учебной таблице БЕЗ влияния на
 * зарплату (в отличие от chavruta_plus_assignments, которая идёт в расчёт
 * оплаты). Решение владельца: «שיוך חברותא נפרד ללא שכר».
 *
 *   GET  → { assignments: [{ id, teacher_person_id, teacher_name,
 *            student_journey_id, student_name }], students: [{ journey_id, name }] }
 *          Право: view chavruta (staff-comp ЛИБО manage_students). students —
 *          активные ученицы для пикера.
 *   POST → создать/реактивировать пару { teacher_person_id, student_journey_id }.
 *          Право: manage chavruta (staff-comp ЛИБО manage_students).
 * Деплой-безопасно (42P01 → пустая сводка).
 */
function u(sb: ReturnType<typeof createServerClient>) { return sb as unknown as SupabaseClient }

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
      const { data } = await sb
        .from('education_journeys')
        .select('id, education_status, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name)')
        .in('education_status', STUDENT_LIFECYCLE)
      for (const j of (data ?? []) as Array<{ id: string; person: { full_name?: string | null; hebrew_name?: string | null } | null }>) {
        students.push({ journey_id: j.id, name: (j.person?.hebrew_name || j.person?.full_name || '').trim() })
      }
      students.sort((a, b) => a.name.localeCompare(b.name, 'he'))
    }

    // Активные пары.
    let rows: Array<{ id: string; teacher_person_id: string; student_journey_id: string }> = []
    try {
      const { data, error } = await u(sb).from('chavruta_pairs')
        .select('id, teacher_person_id, student_journey_id')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
      if (error) throw error
      rows = (data ?? []) as typeof rows
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ assignments: [], students })
      throw e
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
    }))

    return NextResponse.json({ assignments, students })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
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
    const { data, error } = await u(sb).from('chavruta_pairs')
      .insert({ teacher_person_id: teacherId, student_journey_id: journeyId, is_active: true, created_by: session.person_id })
      .select('id, teacher_person_id, student_journey_id, is_active')
      .single()
    if (error) {
      const code = (error as { code?: string }).code
      if (code === '42P01') return apiError('feature_not_migrated', 503)
      if (code === '23505') { // пара уже есть — реактивируем
        const { data: re } = await u(sb).from('chavruta_pairs')
          .update({ is_active: true }).eq('teacher_person_id', teacherId).eq('student_journey_id', journeyId)
          .select('id, teacher_person_id, student_journey_id, is_active').single()
        return NextResponse.json({ assignment: re }, { status: 200 })
      }
      if (code === '23503') return apiError('invalid_reference', 400)
      throw error
    }
    return NextResponse.json({ assignment: data }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
