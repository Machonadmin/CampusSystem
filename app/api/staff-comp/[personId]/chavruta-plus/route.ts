import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canViewStaffComp, canManageStaffComp } from '@/lib/finance/staff-comp'

/**
 * Хеврута-плюс: постоянные пары мора↔ученица (менторство).
 *   GET  → { assignments: [{ id, student_journey_id, student_name, is_active }],
 *           rate, basis } (право view).
 *   POST → добавить пару { student_journey_id } (право manage).
 * Тариф/базис (за ученицу-месяц или за час) — из staff_compensation. Начисление
 * делает generate-chavruta-plus. Деплой-безопасно (42P01).
 */
function u(sb: ReturnType<typeof createServerClient>) { return sb as unknown as SupabaseClient }

export async function GET(_request: NextRequest, { params }: { params: { personId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canViewStaffComp(session))) return apiError('forbidden', 403)

    const sb = createServerClient()

    // Тариф/базис.
    let rate = 0, basis = 'per_student_month'
    try {
      const { data } = await u(sb).from('staff_compensation')
        .select('chavruta_plus_rate, chavruta_plus_basis').eq('person_id', params.personId).maybeSingle()
      const c = data as { chavruta_plus_rate?: number; chavruta_plus_basis?: string } | null
      rate = Number(c?.chavruta_plus_rate ?? 0)
      basis = c?.chavruta_plus_basis ?? 'per_student_month'
    } catch (e) { if ((e as { code?: string }).code !== '42P01') throw e }

    // Пары.
    let rows: Array<{ id: string; student_journey_id: string; is_active: boolean }> = []
    try {
      const { data, error } = await u(sb).from('chavruta_plus_assignments')
        .select('id, student_journey_id, is_active').eq('teacher_person_id', params.personId)
        .order('created_at', { ascending: true })
      if (error) throw error
      rows = (data ?? []) as typeof rows
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ assignments: [], rate, basis })
      throw e
    }

    // Имена учениц.
    const journeyIds = [...new Set(rows.map(r => r.student_journey_id))]
    const nameById = new Map<string, string>()
    if (journeyIds.length) {
      const { data: js } = await sb.from('education_journeys')
        .select('id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name)')
        .in('id', journeyIds)
      for (const j of (js ?? []) as Array<{ id: string; person: { full_name?: string | null; hebrew_name?: string | null } | null }>) {
        nameById.set(j.id, (j.person?.full_name || j.person?.hebrew_name || '').trim())
      }
    }

    const assignments = rows.map(r => ({
      id: r.id,
      student_journey_id: r.student_journey_id,
      student_name: nameById.get(r.student_journey_id) ?? '',
      is_active: r.is_active,
    }))
    return NextResponse.json({ assignments, rate, basis })
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

    const body = await request.json().catch(() => ({})) as { student_journey_id?: string }
    const journeyId = (body.student_journey_id ?? '').trim()
    if (!journeyId) return apiError('invalid_reference', 400)

    const sb = createServerClient()
    const { data, error } = await u(sb).from('chavruta_plus_assignments')
      .insert({ teacher_person_id: params.personId, student_journey_id: journeyId, is_active: true, created_by: session.person_id })
      .select('id, student_journey_id, is_active')
      .single()
    if (error) {
      const code = (error as { code?: string }).code
      if (code === '42P01') return apiError('feature_not_migrated', 503)
      if (code === '23505') { // пара уже есть — реактивируем
        const { data: re } = await u(sb).from('chavruta_plus_assignments')
          .update({ is_active: true }).eq('teacher_person_id', params.personId).eq('student_journey_id', journeyId)
          .select('id, student_journey_id, is_active').single()
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
