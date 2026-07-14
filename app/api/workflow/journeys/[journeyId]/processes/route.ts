import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege, type EducationPrivilege } from '@/lib/education/permissions'

/** Привилегия просмотра по education_status journey. */
function pickViewPrivilege(status: string | null): EducationPrivilege {
  if (status === 'lead') return 'view_leads'
  if (status === 'applicant') return 'view_applicants'
  return 'view_students'
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { journeyId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const sb = createServerClient()

    // Право на просмотр процессов — по статусу journey (+ его подразделение),
    // как в graph. Иначе любой авторизованный читал бы состояние приёма любой
    // абитуриентки перебором journeyId.
    const { data: journeyForAuth } = await sb
      .from('education_journeys')
      .select('education_status, primary_department_id')
      .eq('id', params.journeyId)
      .maybeSingle()
    const authDept = journeyForAuth?.primary_department_id ?? null
    await requireEducationPrivilege(
      pickViewPrivilege(journeyForAuth?.education_status ?? null),
      authDept ? { department_id: authDept } : undefined,
    )

    const { data: instances, error } = await sb
      .from('process_instances')
      .select(`
        id, status, started_at, finished_at, finish_reason,
        template:process_templates(id, code, name_ru),
        stages:stage_instances(
          id, status, final_code, activated_at, completed_at,
          stage_template:stage_templates(id, code, name_ru, sort_order, finals:stage_finals(code, name_ru, is_positive))
        )
      `)
      .eq('journey_id', params.journeyId)
      .order('started_at', { ascending: true })

    if (error) throw error

    return NextResponse.json({ processes: instances ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
