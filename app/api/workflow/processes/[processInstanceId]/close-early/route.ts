import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { closeProcessEarly } from '@/lib/workflow/close-process-early'
import { requireEducationPrivilege } from '@/lib/education/permissions'

/**
 * POST /api/workflow/processes/[processInstanceId]/close-early
 * Досрочное закрытие процесса с выбранным финалом.
 *
 * Право: manage_leads (по primary_department_id журнея).
 *        Для финала convert_to_applicant дополнительно convert_lead.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { processInstanceId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const body = await request.json() as { final_code?: string }
    if (!body.final_code) {
      return NextResponse.json({ error: 'final_code обязателен' }, { status: 400 })
    }

    const sb = createServerClient()

    // process_instance → journey → primary_department_id
    const { data: pi } = await sb
      .from('process_instances')
      .select('journey_id')
      .eq('id', params.processInstanceId)
      .maybeSingle()

    const journeyId = pi?.journey_id ?? null

    let targetDept: string | null = null
    if (journeyId) {
      const { data: journey } = await sb
        .from('education_journeys')
        .select('primary_department_id')
        .eq('id', journeyId)
        .maybeSingle()
      targetDept = journey?.primary_department_id ?? null
    }

    const target = targetDept ? { department_id: targetDept } : undefined

    await requireEducationPrivilege('manage_leads', target)
    if (body.final_code === 'convert_to_applicant') {
      await requireEducationPrivilege('convert_lead', target)
    }

    const result = await closeProcessEarly(
      sb,
      params.processInstanceId,
      body.final_code,
      session.person_id,
    )

    return NextResponse.json({ success: true, ...result })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
