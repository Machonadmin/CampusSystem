import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { journeyDeptTarget } from '@/lib/education/journey-target'
import { getCookieLocale } from '@/lib/i18n/locale'
import { isMissingColumn, isMissingTable } from '@/lib/supabase/errors'
import { averagePercent, submissionState, type SubmissionState } from '@/lib/education/courses'
import { todayISO } from '@/lib/dates'
import { errorResponse } from '@/lib/api/handler'
import type { CourseResultStatus } from '@/types/database'

/**
 * GET /api/education/journeys/[id]/courses
 *
 * Курсы ученицы (учебные группы, куда она записана) с מצב בקורס:
 *   status (нет строки course_results → in_progress), final_grade,
 *   average_percent по выставленным оценкам, и все работы курса с её оценкой
 *   и — для מטלות להגשה — состоянием сдачи.
 *
 * Право: ученица — только своя journey; сотрудник — view_students в
 * подразделении ученицы (как journeys/[id]/grades). can_set_results в ответе
 * говорит UI, по каким курсам сотрудник может менять статус (set_grades группы).
 * Deploy-safe: без новых таблиц/колонки отдаёт курсы без статусов и сдач.
 */

interface GroupRow {
  id: string
  name: string
  period_start: string | null
  period_end: string | null
  department_id: string
  subject: { name: string; name_he: string | null } | null
  teachers: Array<{ teacher_id: string }> | null
}

interface AssessmentLite {
  id: string
  class_group_id: string
  title: string
  description: string | null
  max_score: number
  assessment_date: string | null
  requires_submission?: boolean
}

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()
    const isStudent = session.principal === 'student'
    const isSuper = session.roles.includes('superadmin')

    if (isStudent) {
      if (session.student_journey_id !== params.id) return apiError('forbidden', 403)
    } else if (!isSuper && !(await hasEducationPrivilege(session, 'view_students', await journeyDeptTarget(sb, params.id)))) {
      return apiError('forbidden', 403)
    }

    const lang = getCookieLocale()

    // 1) Группы ученицы.
    const { data: enr, error: eErr } = await sb
      .from('class_enrollments')
      .select('class_group_id')
      .eq('journey_id', params.id)
    if (eErr) throw eErr
    const groupIds = (enr ?? []).map(r => r.class_group_id)
    if (groupIds.length === 0) return NextResponse.json({ courses: [] })

    const { data: groupsRaw, error: gErr } = await sb
      .from('class_groups')
      .select('id, name, period_start, period_end, department_id, subject:subjects(name, name_he), teachers:class_teachers(teacher_id)')
      .in('id', groupIds)
    if (gErr) throw gErr
    const groups = (groupsRaw ?? []) as unknown as GroupRow[]

    // 2) Работы курсов. requires_submission может ещё не существовать.
    let assessments: AssessmentLite[] = []
    {
      const full = await sb
        .from('assessments')
        .select('id, class_group_id, title, description, max_score, assessment_date, requires_submission')
        .in('class_group_id', groupIds)
      if (full.error && isMissingColumn(full.error)) {
        const basic = await sb
          .from('assessments')
          .select('id, class_group_id, title, description, max_score, assessment_date')
          .in('class_group_id', groupIds)
        if (basic.error) throw basic.error
        assessments = (basic.data ?? []) as unknown as AssessmentLite[]
      } else if (full.error) {
        throw full.error
      } else {
        assessments = (full.data ?? []) as unknown as AssessmentLite[]
      }
    }
    const assessmentIds = assessments.map(a => a.id)

    // 3) Её оценки, сдачи и статусы курсов.
    const scoreBy = new Map<string, number>()
    const subBy = new Map<string, { id: string; file_name: string; submitted_at: string }>()
    if (assessmentIds.length > 0) {
      const { data: gr, error: grErr } = await sb
        .from('grades').select('assessment_id, score').eq('journey_id', params.id).in('assessment_id', assessmentIds)
      if (grErr) throw grErr
      for (const r of gr ?? []) scoreBy.set(r.assessment_id, Number(r.score))

      const { data: subs, error: sErr } = await sb
        .from('assessment_submissions').select('id, assessment_id, file_name, submitted_at')
        .eq('journey_id', params.id).in('assessment_id', assessmentIds)
      if (sErr && !isMissingTable(sErr)) throw sErr
      for (const r of subs ?? []) subBy.set(r.assessment_id, { id: r.id, file_name: r.file_name, submitted_at: r.submitted_at })
    }

    const resultBy = new Map<string, { status: CourseResultStatus; final_grade: number | null; note: string | null }>()
    {
      const { data: res, error: rErr } = await sb
        .from('course_results').select('class_group_id, status, final_grade, note')
        .eq('journey_id', params.id).in('class_group_id', groupIds)
      if (rErr && !isMissingTable(rErr)) throw rErr
      for (const r of res ?? []) {
        resultBy.set(r.class_group_id, {
          status: r.status, final_grade: r.final_grade === null ? null : Number(r.final_grade),
          note: isStudent ? null : r.note, // заметка — только для сотрудников
        })
      }
    }

    // 4) Право менять статус — по каждой группе (только сотрудники).
    const canSetBy = new Map<string, boolean>()
    if (!isStudent) {
      for (const g of groups) {
        canSetBy.set(g.id, isSuper || await hasEducationPrivilege(session, 'set_grades', {
          department_id: g.department_id,
          teacher_ids: (g.teachers ?? []).map(t => t.teacher_id),
        }))
      }
    }

    const today = todayISO()
    const courses = groups.map(g => {
      const items = assessments
        .filter(a => a.class_group_id === g.id)
        .map(a => {
          const score = scoreBy.get(a.id)
          const sub = subBy.get(a.id) ?? null
          const requires = a.requires_submission === true
          const state: SubmissionState | null = requires
            ? submissionState(a.assessment_date, sub?.submitted_at ?? null, today)
            : null
          return {
            id: a.id,
            title: a.title,
            description: a.description,
            date: a.assessment_date,
            max_score: Number(a.max_score),
            score: score === undefined ? null : score,
            requires_submission: requires,
            submission: sub,
            submission_state: state,
          }
        })
        .sort((x, y) => (x.date ?? '9999') < (y.date ?? '9999') ? -1 : (x.date ?? '9999') > (y.date ?? '9999') ? 1 : 0)
      const r = resultBy.get(g.id)
      return {
        class_group_id: g.id,
        name: g.name,
        subject: g.subject ? (lang === 'he' ? (g.subject.name_he || g.subject.name) : g.subject.name) : null,
        period_start: g.period_start,
        period_end: g.period_end,
        status: r?.status ?? 'in_progress',
        final_grade: r?.final_grade ?? null,
        note: r?.note ?? null,
        average_percent: averagePercent(items.map(i => ({ score: i.score, max_score: i.max_score }))),
        can_set_result: canSetBy.get(g.id) ?? false,
        assessments: items,
      }
    }).sort((a, b) => (b.period_start ?? '').localeCompare(a.period_start ?? '') || (a.subject ?? a.name).localeCompare(b.subject ?? b.name))

    return NextResponse.json({ courses })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
