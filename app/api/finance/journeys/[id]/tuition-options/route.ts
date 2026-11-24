import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageStudentFinance } from '@/lib/finance/access'
import { isMissingRelation } from '@/lib/supabase/errors'
import { errorResponse } from '@/lib/api/handler'

/**
 * GET /api/finance/journeys/[id]/tuition-options
 *
 * Семестры для «הוספת חיוב» → «שכר לימוד לפי סמסטר»: реальные семестры
 * (class_groups.is_semester) с заданной суммой tuition_amount (её задают в
 * «Финансы › סמסטרים»). charged — у этой студентки уже есть активный счёт за
 * семестр (второй сервер не даст: POST /charges → 409).
 *
 * Право — то же, что на создание счёта этой студентке (canManageStudentFinance):
 * сотрудник с доступом к финансам одной студентки тоже видит список.
 * Деплой-безопасно: без колонок семестра — пустой список.
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageStudentFinance(session, params.id))) return apiError('forbidden', 403)

    const sb = createServerClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: groups, error } = await (sb
      .from('class_groups')
      .select('id, name, name_he, tuition_amount, year_label, term_number, sem_status, track:study_tracks(id, name_he, name_ru, name_en)')
      .eq('is_semester', true)
      .gt('tuition_amount', 0)
      .order('year_label', { ascending: false })
      .order('term_number', { ascending: true }) as any)
    if (error) {
      if (isMissingRelation(error)) return NextResponse.json({ semesters: [] })
      throw error
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (groups ?? []) as any[]
    if (rows.length === 0) return NextResponse.json({ semesters: [] })

    const charged = new Set<string>()
    const { data: charges, error: cErr } = await sb
      .from('finance_charges')
      .select('class_group_id')
      .eq('journey_id', params.id)
      .eq('category', 'tuition')
      .eq('status', 'active')
      .in('class_group_id', rows.map(g => g.id as string))
    if (cErr && !isMissingRelation(cErr)) throw cErr
    for (const r of (charges ?? []) as Array<{ class_group_id: string | null }>) {
      if (r.class_group_id) charged.add(r.class_group_id)
    }

    const semesters = rows.map(g => ({
      id: g.id as string,
      name: (g.name ?? null) as string | null,
      name_he: (g.name_he ?? null) as string | null,
      year_label: (g.year_label ?? null) as string | null,
      term_number: (g.term_number ?? null) as number | null,
      status: (g.sem_status ?? 'open') as 'open' | 'closed',
      tuition_amount: Number(g.tuition_amount),
      study_track: g.track ?? null,
      charged: charged.has(g.id),
    }))

    return NextResponse.json({ semesters })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    if (isMissingRelation(e)) return NextResponse.json({ semesters: [] })
    return errorResponse(e)
  }
}
