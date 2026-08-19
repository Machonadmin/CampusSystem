import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { isChavrutaTeacher } from '@/lib/chavruta/teachers'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'

/**
 * GET /api/chavruta/students — с кем мора может записать хавруту.
 * Ученицы кодеш-групп, которые ведёт сама мора; если она не ведёт ни одной
 * (ручная мора), — все ученицы, записанные в любую кодеш-группу.
 * Гейт: isChavrutaTeacher. Деплой-безопасно (пустой список при 42P01).
 * Ответ: { students: [{ journey_id, name }] }.
 */
function u(sb: ReturnType<typeof createServerClient>) { return sb as unknown as SupabaseClient }

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)

    const sb = createServerClient()
    if (!(await isChavrutaTeacher(sb, session.person_id))) return apiError('forbidden', 403)

    try {
      // Кодеш-группы.
      const { data: groups } = await sb.from('class_groups').select('id').eq('department_id', KODESH_DEPT_ID)
      const kodeshGroupIds = (groups ?? []).map(g => (g as { id: string }).id)
      if (kodeshGroupIds.length === 0) return NextResponse.json({ students: [] })

      // Группы, которые ведёт эта мора (пересечение с кодешем).
      const { data: ct } = await sb.from('class_teachers').select('class_group_id')
        .eq('teacher_id', session.person_id).in('class_group_id', kodeshGroupIds)
      const ownGroupIds = [...new Set((ct ?? []).map(r => (r as { class_group_id: string }).class_group_id))]

      // Свои группы, иначе — все кодеш-группы (для ручной моры).
      const scopeGroupIds = ownGroupIds.length ? ownGroupIds : kodeshGroupIds

      const { data: enr } = await u(sb).from('class_enrollments').select('journey_id').in('class_group_id', scopeGroupIds)
      const journeyIds = [...new Set((enr ?? []).map((r: { journey_id: string }) => r.journey_id))]
      if (journeyIds.length === 0) return NextResponse.json({ students: [] })

      const { data: js } = await sb.from('education_journeys')
        .select('id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name)')
        .in('id', journeyIds)
      const students = ((js ?? []) as Array<{ id: string; person: { full_name?: string | null; hebrew_name?: string | null } | null }>)
        .map(j => ({ journey_id: j.id, name: (j.person?.full_name || j.person?.hebrew_name || '').trim() }))
        .sort((a, b) => a.name.localeCompare(b.name, 'he'))

      return NextResponse.json({ students })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ students: [] })
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
