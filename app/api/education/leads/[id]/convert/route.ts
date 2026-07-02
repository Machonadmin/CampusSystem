import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import {
  hasEducationPrivilege,
  requireEducationPrivilege,
} from '@/lib/education/permissions'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

/**
 * PATCH /api/education/leads/[id]/convert
 * Конверт lead → applicant. [id] = journey.id.
 *
 * Право: manage_students с desired_department_id из journey
 *        (если desired_department_id NULL — общий чек без department).
 *
 * @deprecated Прямой конверт обходит движок процессов (процесс «Набор»
 * остаётся активным). Используйте POST /api/workflow/processes/[id]/close-early
 * с final_code='convert_to_applicant' — он корректно закрывает процесс.
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    const sb = createServerClient()

    const { data: journey, error: fetchErr } = await sb
      .from('education_journeys')
      .select('id, person_id, education_status, desired_department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!journey || journey.education_status !== 'lead') {
      return NextResponse.json({ error: 'Лид не найден или уже переведён' }, { status: 404 })
    }

    if (journey.desired_department_id) {
      await requireEducationPrivilege('convert_lead', { department_id: journey.desired_department_id })
    } else {
      const allowed = await hasEducationPrivilege(session, 'convert_lead', {})
      if (!allowed) {
        return NextResponse.json({ error: 'Нет прав на конверт' }, { status: 403 })
      }
    }

    const { error: updErr } = await sb
      .from('education_journeys')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ education_status: 'applicant' } as any)
      .eq('id', params.id)
      .eq('education_status', 'lead')
    if (updErr) throw updErr

    await sb.from('person_status_history')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        person_id: journey.person_id,
        from_status: 'lead',
        to_status: 'applicant',
        changed_by: session.person_id,
      } as any)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
