import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege, type EducationPrivilege } from '@/lib/education/permissions'

/** Привилегия просмотра по education_status journey. */
function pickViewPrivilege(status: string | null): EducationPrivilege {
  if (status === 'lead') return 'view_leads'
  if (status === 'applicant') return 'view_applicants'
  return 'view_students'
}

/**
 * GET /api/education/students/[id]/enrollments
 * В каких учебных группах состоит данный студент.
 *
 * [id] здесь — journey.id (не student.id).
 * Совместим с proxy /api/education/students/[id] → journeys/[id].
 *
 * Право: view по статусу journey (+ его подразделение как target), как в
 * journeys/[id] и graph. Иначе любой авторизованный читал бы состав групп
 * (ФИО студенток) без education-привилегий.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sb = createServerClient()

    const { data: journey } = await sb
      .from('education_journeys')
      .select('education_status, primary_department_id')
      .eq('id', params.id)
      .maybeSingle()
    const targetDept = journey?.primary_department_id ?? null
    await requireEducationPrivilege(
      pickViewPrivilege(journey?.education_status ?? null),
      targetDept ? { department_id: targetDept } : undefined,
    )

    const { data, error } = await sb
      .from('class_enrollments')
      .select(`
        journey_id,
        class_group_id,
        enrolled_at,
        class_group:class_groups(
          id,
          name,
          level,
          period_start,
          period_end,
          subject:subjects(id, name),
          department:departments(id, name)
        )
      `)
      .eq('journey_id', params.id)
      .order('enrolled_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ enrollments: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
