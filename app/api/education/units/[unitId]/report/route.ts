import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageUnit } from '@/lib/education/unit-access'
import { round1, attendancePercent } from '@/lib/education/metrics'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * GET /api/education/units/[unitId]/report
 *
 * Сводный отчёт учебной единицы (department) для руководителя/секретаря:
 *   • по каждой учебной группе — посещаемость и средняя оценка (по всем
 *     записанным студентам), число студентов, уроков, заданий;
 *   • по каждому студенту единицы — его посещаемость и средняя оценка,
 *     агрегированные по всем группам этой единицы;
 *   • сводка по всей единице.
 *
 * Только чтение и агрегация над существующими таблицами. Новых таблиц нет.
 * Право: superadmin или глава единицы (canManageUnit).
 */

// PostgREST молча обрезает выдачу на db-max-rows (~1000). Над всей единицей
// строк посещаемости/оценок (студенты × уроки) заведомо больше — читаем
// постранично И чанками по фильтру .in(), чтобы не упереться в длину URL.
const PAGE = 1000
const IN_CHUNK = 150

/** Все строки таблицы по фильтру col ∈ ids: чанки по ids + пагинация внутри чанка. */
async function fetchAllByIn<Row>(
  sb: SupabaseClient,
  table: string,
  selectCols: string,
  filterCol: string,
  ids: string[],
): Promise<Row[]> {
  const out: Row[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK)
    let from = 0
    for (;;) {
      const { data, error } = await sb
        .from(table)
        .select(selectCols)
        .in(filterCol, chunk)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw error
      const rows = (data ?? []) as unknown as Row[]
      out.push(...rows)
      if (rows.length < PAGE) break
      from += PAGE
    }
  }
  return out
}

type Att = { present: number; late: number; absent: number }
function emptyAtt(): Att { return { present: 0, late: 0, absent: 0 } }
function addStatus(a: Att, status: string | null) {
  if (status === 'absent') a.absent++
  else if (status === 'late') a.late++
  else a.present++ // present и любые старые статусы — как присутствие
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { unitId: string } },
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageUnit(session, params.unitId))) return apiError('forbidden', 403)

    const sb = createServerClient()

    // 0. Единица существует?
    const { data: dept } = await sb.from('departments').select('id, name').eq('id', params.unitId).maybeSingle()
    if (!dept) return apiError('not_found', 404)
    const unitName = (dept as { name: string }).name

    // 1. Активные учебные группы единицы.
    const { data: groupsRaw } = await sb
      .from('class_groups')
      .select('id, name, level, subject:subjects(id, name, name_he)')
      .eq('department_id', params.unitId)
      .eq('is_active', true)
    const groups = (groupsRaw ?? []) as unknown as Array<{
      id: string; name: string; level: string | null
      subject: { id: string; name: string; name_he: string | null } | null
    }>
    const groupIds = groups.map(g => g.id)

    if (groupIds.length === 0) {
      return NextResponse.json({
        unit: { id: params.unitId, name: unitName },
        groups: [], students: [],
        summary: emptySummary(),
      })
    }

    // 2. Записи (enrollments): journey ↔ группа + имя студента.
    const enrollRows = await fetchAllByIn<{
      journey_id: string; class_group_id: string
      journey: { id: string; person: { id: string; full_name: string | null; hebrew_name: string | null } | null } | null
    }>(
      sb, 'class_enrollments',
      'id, journey_id, class_group_id, journey:education_journeys(id, person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name))',
      'class_group_id', groupIds,
    )

    const studentCountByGroup = new Map<string, number>()
    const journeysByGroup = new Map<string, string[]>()
    const nameByJourney = new Map<string, string>()
    const journeyIdSet = new Set<string>()
    for (const e of enrollRows) {
      studentCountByGroup.set(e.class_group_id, (studentCountByGroup.get(e.class_group_id) ?? 0) + 1)
      const arr = journeysByGroup.get(e.class_group_id) ?? []
      arr.push(e.journey_id); journeysByGroup.set(e.class_group_id, arr)
      journeyIdSet.add(e.journey_id)
      const p = e.journey?.person
      if (p) nameByJourney.set(e.journey_id, p.hebrew_name || p.full_name || '')
    }

    // 3. Уроки (только не отменённые) → урок→группа, всего уроков по группе.
    const lessonRows = await fetchAllByIn<{ id: string; class_group_id: string; is_cancelled: boolean | null }>(
      sb, 'lessons', 'id, class_group_id, is_cancelled', 'class_group_id', groupIds,
    )
    const lessonToGroup = new Map<string, string>()
    const totalLessonsByGroup = new Map<string, number>()
    for (const l of lessonRows) {
      if (l.is_cancelled) continue
      lessonToGroup.set(l.id, l.class_group_id)
      totalLessonsByGroup.set(l.class_group_id, (totalLessonsByGroup.get(l.class_group_id) ?? 0) + 1)
    }

    // 4. Посещаемость над этими уроками (все студенты единицы).
    const attByGroup = new Map<string, Att>()
    const attByJourney = new Map<string, Att>()
    const lessonIds = [...lessonToGroup.keys()]
    if (lessonIds.length > 0) {
      const attRows = await fetchAllByIn<{ lesson_id: string; journey_id: string; status: string | null }>(
        sb, 'attendance', 'id, lesson_id, journey_id, status', 'lesson_id', lessonIds,
      )
      for (const r of attRows) {
        const gid = lessonToGroup.get(r.lesson_id)
        if (!gid) continue
        const g = attByGroup.get(gid) ?? emptyAtt(); addStatus(g, r.status); attByGroup.set(gid, g)
        const j = attByJourney.get(r.journey_id) ?? emptyAtt(); addStatus(j, r.status); attByJourney.set(r.journey_id, j)
      }
    }

    // 5. Задания групп → задание→(группа, max_score), всего заданий по группе.
    const assessRows = await fetchAllByIn<{ id: string; class_group_id: string; max_score: number }>(
      sb, 'assessments', 'id, class_group_id, max_score', 'class_group_id', groupIds,
    )
    const assessGroup = new Map<string, string>()
    const assessMax = new Map<string, number>()
    const totalAssessmentsByGroup = new Map<string, number>()
    for (const a of assessRows) {
      assessGroup.set(a.id, a.class_group_id)
      assessMax.set(a.id, Number(a.max_score))
      totalAssessmentsByGroup.set(a.class_group_id, (totalAssessmentsByGroup.get(a.class_group_id) ?? 0) + 1)
    }

    // 6. Оценки над этими заданиями → проценты по группе и по студенту.
    const gradePctByGroup = new Map<string, number[]>()
    const gradePctByJourney = new Map<string, number[]>()
    const assessmentIds = [...assessGroup.keys()]
    if (assessmentIds.length > 0) {
      const gradeRows = await fetchAllByIn<{ assessment_id: string; journey_id: string; score: number | null }>(
        sb, 'grades', 'id, assessment_id, journey_id, score', 'assessment_id', assessmentIds,
      )
      for (const r of gradeRows) {
        const gid = assessGroup.get(r.assessment_id)
        const max = assessMax.get(r.assessment_id) ?? 0
        if (!gid || r.score === null || max <= 0) continue
        const pct = (Number(r.score) / max) * 100
        const gArr = gradePctByGroup.get(gid) ?? []; gArr.push(pct); gradePctByGroup.set(gid, gArr)
        const jArr = gradePctByJourney.get(r.journey_id) ?? []; jArr.push(pct); gradePctByJourney.set(r.journey_id, jArr)
      }
    }

    const avg = (xs: number[]): number | null =>
      xs.length === 0 ? null : round1(xs.reduce((s, x) => s + x, 0) / xs.length)

    // 7. Сборка: группы.
    const groupsOut = groups.map(g => {
      const a = attByGroup.get(g.id) ?? emptyAtt()
      const gp = gradePctByGroup.get(g.id) ?? []
      return {
        class_group_id: g.id,
        name: g.name,
        level: g.level,
        subject: g.subject ? { id: g.subject.id, name: g.subject.name_he || g.subject.name } : null,
        student_count: studentCountByGroup.get(g.id) ?? 0,
        attendance: {
          present: a.present, late: a.late, absent: a.absent,
          marked: a.present + a.late + a.absent,
          total_lessons: totalLessonsByGroup.get(g.id) ?? 0,
          percent: attendancePercent(a),
        },
        grades: {
          graded_count: gp.length,
          total_assessments: totalAssessmentsByGroup.get(g.id) ?? 0,
          average: avg(gp),
        },
      }
    }).sort((a, b) => a.name.localeCompare(b.name, 'he'))

    // 8. Сборка: студенты (агрегат по всем группам единицы).
    const groupsPerJourney = new Map<string, number>()
    for (const [, jids] of journeysByGroup) for (const jid of jids)
      groupsPerJourney.set(jid, (groupsPerJourney.get(jid) ?? 0) + 1)

    const studentsOut = [...journeyIdSet].map(jid => {
      const a = attByJourney.get(jid) ?? emptyAtt()
      const gp = gradePctByJourney.get(jid) ?? []
      return {
        journey_id: jid,
        name: nameByJourney.get(jid) ?? '',
        group_count: groupsPerJourney.get(jid) ?? 0,
        attendance: {
          present: a.present, late: a.late, absent: a.absent,
          marked: a.present + a.late + a.absent,
          percent: attendancePercent(a),
        },
        grade_average: avg(gp),
      }
    }).sort((a, b) => a.name.localeCompare(b.name, 'he'))

    // 9. Сводка по всей единице.
    const unitAtt = emptyAtt()
    for (const a of attByGroup.values()) { unitAtt.present += a.present; unitAtt.late += a.late; unitAtt.absent += a.absent }
    const allGradePct: number[] = []
    for (const xs of gradePctByGroup.values()) allGradePct.push(...xs)
    let sumLessons = 0, sumAssessments = 0
    for (const v of totalLessonsByGroup.values()) sumLessons += v
    for (const v of totalAssessmentsByGroup.values()) sumAssessments += v

    const summary = {
      group_count: groups.length,
      student_count: journeyIdSet.size,
      attendance: {
        present: unitAtt.present, late: unitAtt.late, absent: unitAtt.absent,
        marked: unitAtt.present + unitAtt.late + unitAtt.absent,
        total_lessons: sumLessons,
        percent: attendancePercent(unitAtt),
      },
      grades: {
        graded_count: allGradePct.length,
        total_assessments: sumAssessments,
        average: avg(allGradePct),
      },
    }

    return NextResponse.json({
      unit: { id: params.unitId, name: unitName },
      groups: groupsOut,
      students: studentsOut,
      summary,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code === '42P01') {
      // Таблица ещё не создана — деплой-безопасно вернуть пустой отчёт.
      return NextResponse.json({ unit: { id: params.unitId, name: '' }, groups: [], students: [], summary: emptySummary() })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

function emptySummary() {
  return {
    group_count: 0, student_count: 0,
    attendance: { present: 0, late: 0, absent: 0, marked: 0, total_lessons: 0, percent: null as number | null },
    grades: { graded_count: 0, total_assessments: 0, average: null as number | null },
  }
}
