import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { getClassGroupTarget } from '@/lib/education/lesson-access'
import { round1 } from '@/lib/education/metrics'

// PostgREST обрезает выдачу на db-max-rows (~1000). Оценок над группой
// (студенты × задания) может быть больше — читаем постранично.
const PAGE = 1000

type EnrollRow = {
  journey_id: string
  journey: { id: string; person: { full_name: string | null; hebrew_name: string | null } | null } | null
}

/**
 * GET /api/education/class-groups/[id]/gradebook
 *
 * Полный журнал оценок группы: матрица «студент × задание». Колонки —
 * задания (по дате), строки — записанные студенты со своими баллами и
 * средним процентом. Плюс средний процент по каждому заданию.
 *
 * Только чтение/агрегация. Право: view_students в контексте группы.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const sb = createServerClient()
    const from = (request.nextUrl.searchParams.get('from') ?? '').trim()
    const to = (request.nextUrl.searchParams.get('to') ?? '').trim()

    const target = await getClassGroupTarget(sb, params.id)
    if (!target) return apiError('group_not_found', 404)
    await requireEducationPrivilege('view_students', target)

    // Задания группы (по возрастанию даты → хронология колонок).
    // Период: при активном from/to берём только датированные задания в диапазоне
    // (SQL-сравнение с NULL ложно → недатированные исключаются, как в отчёте).
    let assessQ = sb
      .from('assessments')
      .select('id, title, max_score, assessment_date')
      .eq('class_group_id', params.id)
    if (from) assessQ = assessQ.gte('assessment_date', from)
    if (to) assessQ = assessQ.lte('assessment_date', to)
    const { data: assessRaw, error: aErr } = await assessQ
      .order('assessment_date', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })
    if (aErr) throw aErr
    const assessments = (assessRaw ?? []).map(a => ({
      id: a.id as string,
      title: a.title as string,
      max_score: Number(a.max_score),
      assessment_date: (a.assessment_date as string | null) ?? null,
    }))
    const maxById = new Map(assessments.map(a => [a.id, a.max_score]))
    const assessmentIds = assessments.map(a => a.id)

    // Ростер группы.
    const { data: enrollRaw, error: eErr } = await sb
      .from('class_enrollments')
      .select('journey_id, journey:education_journeys(id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name))')
      .eq('class_group_id', params.id)
    if (eErr) throw eErr
    const enrolls = (enrollRaw ?? []) as unknown as EnrollRow[]

    // Оценки над заданиями группы — постранично.
    const scoreByKey = new Map<string, number>() // `${journey}|${assessment}` → score
    if (assessmentIds.length > 0) {
      let from = 0
      for (;;) {
        const { data: grades, error: gErr } = await sb
          .from('grades')
          .select('assessment_id, journey_id, score')
          .in('assessment_id', assessmentIds)
          .order('journey_id', { ascending: true })
          .range(from, from + PAGE - 1)
        if (gErr) throw gErr
        const rows = grades ?? []
        for (const r of rows) {
          if (r.score === null) continue
          scoreByKey.set(`${r.journey_id}|${r.assessment_id}`, Number(r.score))
        }
        if (rows.length < PAGE) break
        from += PAGE
      }
    }

    // Строки студентов + средний процент; параллельно копим суммы по заданиям.
    const perAssessmentPct = new Map<string, number[]>()
    const students = enrolls.map(row => {
      const person = row.journey?.person ?? null
      const name = person?.hebrew_name || person?.full_name || ''
      const scores: Record<string, number | null> = {}
      const pcts: number[] = []
      for (const a of assessments) {
        const s = scoreByKey.get(`${row.journey_id}|${a.id}`)
        scores[a.id] = s ?? null
        if (s !== undefined && a.max_score > 0) {
          const pct = (s / a.max_score) * 100
          pcts.push(pct)
          const arr = perAssessmentPct.get(a.id) ?? []; arr.push(pct); perAssessmentPct.set(a.id, arr)
        }
      }
      return {
        journey_id: row.journey_id,
        name,
        scores,
        average: pcts.length === 0 ? null : round1(pcts.reduce((s, x) => s + x, 0) / pcts.length),
      }
    }).sort((a, b) => a.name.localeCompare(b.name, 'he'))

    const assessmentsOut = assessments.map(a => {
      const arr = perAssessmentPct.get(a.id) ?? []
      return {
        ...a,
        graded_count: arr.length,
        average: arr.length === 0 ? null : round1(arr.reduce((s, x) => s + x, 0) / arr.length),
      }
    })

    return NextResponse.json({
      class_group_id: params.id,
      assessments: assessmentsOut,
      students,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code === '42P01') {
      return NextResponse.json({ class_group_id: params.id, assessments: [], students: [] })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
