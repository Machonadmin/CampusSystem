import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { journeyDeptTarget } from '@/lib/education/journey-target'
import { getCookieLocale } from '@/lib/i18n/locale'

/**
 * GET /api/education/journeys/[id]/grades
 *
 * Оценки студентки: её выставленные оценки по всем заданиям, с названием
 * задания, предметом, учебной группой, баллом/максимумом и датой. Только
 * чтение/агрегация. Отсортировано по дате (свежие сверху, null-даты в конце).
 *
 * Право: студентка видит СВОИ оценки только по своей journey (иначе 403);
 * staff — view_students в подразделении студентки (или superadmin) — как
 * карточка/календарь. Деплой-безопасно к отсутствию таблиц (пустой список).
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()
    // Байпас для студентки: свои оценки — только своя journey (иначе 403);
    // staff-путь проверяется как обычно, ниже.
    if (session.principal === 'student') {
      if (session.student_journey_id !== params.id) return apiError('forbidden', 403)
    } else {
      const allowed = session.roles.includes('superadmin')
        || await hasEducationPrivilege(session, 'view_students', await journeyDeptTarget(sb, params.id))
      if (!allowed) return apiError('forbidden', 403)
    }

    const lang = getCookieLocale()

    // Оценки этой journey + задание → группа → предмет (одним запросом).
    const { data: gradesRaw, error: gErr } = await sb
      .from('grades')
      .select('assessment_id, score, assessment:assessments(id, title, max_score, assessment_date, class_group:class_groups(name, subject:subjects(name, name_he)))')
      .eq('journey_id', params.id)
    if (gErr) {
      if ((gErr as { code?: string }).code === '42P01') return NextResponse.json({ grades: [] })
      throw gErr
    }

    const rows = (gradesRaw ?? []) as unknown as Array<{
      assessment_id: string
      score: number | null
      assessment: {
        id: string; title: string; max_score: number; assessment_date: string | null
        class_group: { name: string; subject: { name: string; name_he: string | null } | null } | null
      } | null
    }>

    const grades = rows
      .filter(r => r.assessment !== null)
      .map(r => {
        const a = r.assessment!
        const subj = a.class_group?.subject
        return {
          assessment_id: r.assessment_id,
          title: a.title,
          subject: subj ? (lang === 'he' ? (subj.name_he || subj.name) : subj.name) : null,
          group_name: a.class_group?.name ?? '',
          score: r.score === null ? null : Number(r.score),
          max_score: Number(a.max_score),
          date: a.assessment_date,
        }
      })
      // Свежие сверху; задания без даты — в конец.
      .sort((x, y) => {
        if (x.date === y.date) return 0
        if (!x.date) return 1
        if (!y.date) return -1
        return x.date < y.date ? 1 : -1
      })

    return NextResponse.json({ grades })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
