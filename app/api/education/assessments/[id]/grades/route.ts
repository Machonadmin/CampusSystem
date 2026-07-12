import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { getAssessmentAccess, getEnrolledJourneyIds } from '@/lib/education/lesson-access'
import type { GradeInsert } from '@/types/database'

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '22P02') return { status: 400, message: serverT('invalid_id') }
  if (error.code === '23503') return { status: 400, message: serverT('invalid_reference') }
  if (error.code === '23514') return { status: 400, message: serverT('invalid_grade') }
  return { status: 500, message: error.message ?? serverT('db_error') }
}

// Форма записи класса, записанного в группу (для отображения ростера).
type EnrollRow = {
  journey_id: string
  journey: {
    id: string
    person: { id: string; full_name: string | null; hebrew_name: string | null } | null
  } | null
}

/**
 * GET /api/education/assessments/[id]/grades
 * Оценки задания, наложенные на список студентов группы: каждый записанный
 * студент отдаётся со своей оценкой или как ещё не оценённый (null).
 * Право: view_students в контексте группы задания.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sb = createServerClient()

    const access = await getAssessmentAccess(sb, params.id)
    if (!access) return apiError('assignment_not_found', 404)

    await requireEducationPrivilege('view_students', access.target)

    const classGroupId = access.assessment.class_group_id

    const [enrollsRes, gradesRes] = await Promise.all([
      sb.from('class_enrollments')
        .select(`
          journey_id,
          journey:education_journeys(
            id,
            person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name)
          )
        `)
        .eq('class_group_id', classGroupId),
      sb.from('grades')
        .select('journey_id, score, comment, graded_by, graded_at')
        .eq('assessment_id', params.id),
    ])
    if (enrollsRes.error) throw enrollsRes.error
    if (gradesRes.error) throw gradesRes.error

    const gradeByJourney = new Map<string, { score: number; comment: string | null; graded_by: string | null; graded_at: string | null }>()
    for (const row of gradesRes.data ?? []) {
      gradeByJourney.set(row.journey_id, {
        score: row.score as number,
        comment: row.comment,
        graded_by: row.graded_by,
        graded_at: row.graded_at,
      })
    }

    const enrolls = (enrollsRes.data ?? []) as unknown as EnrollRow[]
    const students = enrolls.map(row => {
      const person = row.journey?.person ?? null
      const g = gradeByJourney.get(row.journey_id) ?? null
      return {
        journey_id: row.journey_id,
        full_name: person?.full_name ?? null,
        hebrew_name: person?.hebrew_name ?? null,
        score: g?.score ?? null,
        comment: g?.comment ?? null,
        graded_by: g?.graded_by ?? null,
        graded_at: g?.graded_at ?? null,
      }
    })

    return NextResponse.json({
      assessment_id: params.id,
      class_group_id: classGroupId,
      max_score: access.assessment.max_score,
      students,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

/**
 * POST /api/education/assessments/[id]/grades
 * Массовое выставление оценок. Право: set_grades в контексте группы задания.
 *
 * Body: { entries: { journey_id: string; score: number; comment?: string }[] }
 * Upsert по паре (assessment_id, journey_id); graded_by = текущий пользователь,
 * graded_at = сейчас. Каждый score в диапазоне [0, max_score]; каждый journey
 * должен быть записан в группу задания.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as {
      entries?: { journey_id?: string; score?: number; comment?: string | null }[]
    }

    const entries = body.entries
    if (!Array.isArray(entries) || entries.length === 0) {
      return apiError('entries_required_nonempty', 400)
    }

    // Базовая валидация каждой записи (без БД): journey_id есть, score — число >= 0
    for (const entry of entries) {
      if (!entry.journey_id) {
        return apiError('entry_journey_id_required', 400)
      }
      const score = Number(entry.score)
      if (entry.score === undefined || entry.score === null || !Number.isFinite(score)) {
        return NextResponse.json(
          { error: `У каждой записи должен быть числовой score (journey ${entry.journey_id})` },
          { status: 400 }
        )
      }
      if (score < 0) {
        return NextResponse.json(
          { error: `score не может быть отрицательным (journey ${entry.journey_id})` },
          { status: 400 }
        )
      }
    }

    const sb = createServerClient()

    const access = await getAssessmentAccess(sb, params.id)
    if (!access) return apiError('assignment_not_found', 404)

    const session = await requireEducationPrivilege('set_grades', access.target)

    // Верхняя граница: score <= max_score задания
    const maxScore = Number(access.assessment.max_score)
    for (const entry of entries) {
      const score = Number(entry.score)
      if (score > maxScore) {
        return NextResponse.json(
          { error: `score ${score} превышает максимум ${maxScore} (journey ${entry.journey_id})` },
          { status: 400 }
        )
      }
    }

    // Каждый journey должен быть записан в группу задания
    const enrolledIds = await getEnrolledJourneyIds(sb, access.assessment.class_group_id)
    const notEnrolled = Array.from(new Set(entries.map(e => e.journey_id!)))
      .filter(id => !enrolledIds.has(id))
    if (notEnrolled.length > 0) {
      return NextResponse.json(
        { error: `Не записаны в группу задания: ${notEnrolled.join(', ')}` },
        { status: 400 }
      )
    }

    const gradedAt = new Date().toISOString()
    const rows: GradeInsert[] = entries.map(e => ({
      assessment_id: params.id,
      journey_id: e.journey_id!,
      score: Number(e.score),
      comment: typeof e.comment === 'string' ? (e.comment.trim() || null) : null,
      graded_by: session.person_id,
      graded_at: gradedAt,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await sb
      .from('grades')
      .upsert(rows as any, { onConflict: 'assessment_id,journey_id' })
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json({ graded: rows.length }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
