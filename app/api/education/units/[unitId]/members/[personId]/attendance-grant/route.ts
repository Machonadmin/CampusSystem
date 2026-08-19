import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageUnit } from '@/lib/education/unit-access'

/**
 * PUT /api/education/units/[unitId]/members/[personId]/attendance-grant
 * Руководитель задаёт учителю ПОСТОЯННОЕ доп. время на отметку посещаемости
 * (в минутах). Хранится как teacher_attendance_grants с lesson_id=NULL — одна
 * «постоянная» строка на учителя. 0 → снять доп. время.
 *   body: { extra_minutes: number }
 * Право: superadmin или глава единицы; цель — активный член единицы.
 */
export async function PUT(request: NextRequest, { params }: { params: { unitId: string; personId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageUnit(session, params.unitId))) return apiError('forbidden', 403)

    const sb = createServerClient()
    const today = new Date().toISOString().slice(0, 10)
    const { data: pos } = await sb.from('staff_positions')
      .select('end_date').eq('person_id', params.personId).eq('department_id', params.unitId)
    const isMember = (pos ?? []).some(p => { const ed = (p as { end_date: string | null }).end_date; return ed === null || ed > today })
    if (!isMember) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { extra_minutes?: number }
    const minutes = Math.max(0, Math.min(24 * 60, Math.round(Number(body.extra_minutes) || 0)))

    // Убираем прежнюю постоянную выдачу, затем создаём новую (если > 0).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (sb as any).from('teacher_attendance_grants')
    const del = await g.delete().eq('teacher_id', params.personId).is('lesson_id', null)
    if (del.error) {
      if ((del.error as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      throw del.error
    }
    if (minutes > 0) {
      const { error } = await g.insert({ teacher_id: params.personId, lesson_id: null, extra_minutes: minutes, granted_by: session.person_id })
      if (error) throw error
    }
    return NextResponse.json({ ok: true, extra_minutes: minutes })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
