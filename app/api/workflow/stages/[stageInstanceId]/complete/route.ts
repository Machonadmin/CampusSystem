import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { completeStage } from '@/lib/workflow/complete-stage'
import { requireEducationPrivilege } from '@/lib/education/permissions'

export async function POST(
  request: NextRequest,
  { params }: { params: { stageInstanceId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const body = await request.json() as {
      final_code: string
      result_data?: Record<string, unknown>
    }
    if (!body.final_code) {
      return NextResponse.json({ error: 'final_code обязателен' }, { status: 400 })
    }

    const sb = createServerClient()

    // Загружаем primary_department_id: stage_instance → process_instance → journey
    const { data: si } = await sb
      .from('stage_instances')
      .select('process_instance:process_instances(journey_id)')
      .eq('id', params.stageInstanceId)
      .maybeSingle()

    const journeyId = (si?.process_instance as unknown as { journey_id: string } | null)?.journey_id ?? null

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

    const result = await completeStage(
      sb,
      params.stageInstanceId,
      body.final_code,
      session.person_id,
      body.result_data,
    )

    return NextResponse.json({ ok: true, ...result })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
