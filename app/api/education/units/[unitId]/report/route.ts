import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageUnit } from '@/lib/education/unit-access'
import { round1, attendancePercent } from '@/lib/education/metrics'
import { KODESH_DEPT_ID, loadKodeshExemptions } from '@/lib/education/kodesh-exceptions'
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

/**
 * Все строки таблицы по фильтру col ∈ ids: чанки по ids + пагинация внутри чанка.
 * orderCols задаёт СТАБИЛЬНЫЙ полный порядок для .range()-пагинации; должен
 * состоять из реально существующих колонок (не у всех таблиц есть `id` —
 * напр. class_enrollments имеет составной PK без id).
 */
async function fetchAllByIn<Row>(
  sb: SupabaseClient,
  table: string,
  selectCols: string,
  filterCol: string,
  ids: string[],
  orderCols: string[] = ['id'],
): Promise<Row[]> {
  const out: Row[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK)
    let from = 0
    for (;;) {
      let q = sb.from(table).select(selectCols).in(filterCol, chunk)
      for (const col of orderCols) q = q.order(col, { ascending: true })
      const { data, error } = await q.range(from, from + PAGE - 1)
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

/** true, если ISO-дата d попадает в [from, to] (границы включительно, любая — опц.). */
function inRange(d: string | null, from: string, to: string): boolean {
  if (!from && !to) return true
  if (!d) return false // при активном фильтре период недатированного элемента неизвестен → исключаем
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

export async function GET(
  request: NextRequest,
  { params }: { params: { unitId: string } },
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageUnit(session, params.unitId))) return apiError('forbidden', 403)

    const sb = createServerClient()
    const from = (request.nextUrl.searchParams.get('from') ?? '').trim()
    const to = (request.nextUrl.searchParams.get('to') ?? '').trim()

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
      'journey_id, class_group_id, journey:education_journeys(id, person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name))',
      'class_group_id', groupIds,
      ['class_group_id', 'journey_id'], // class_enrollments: составной PK, без id
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

    // 3. Уроки (только не отменённые, в выбранном периоде) → урок→группа, всего.
    const lessonRows = await fetchAllByIn<{ id: string; class_group_id: string; scheduled_date: string; is_cancelled: boolean | null }>(
      sb, 'lessons', 'id, class_group_id, scheduled_date, is_cancelled', 'class_group_id', groupIds,
    )
    const lessonToGroup = new Map<string, string>()
    const lessonDate = new Map<string, string>()
    const totalLessonsByGroup = new Map<string, number>()
    for (const l of lessonRows) {
      if (l.is_cancelled) continue
      if (!inRange(l.scheduled_date, from, to)) continue
      lessonToGroup.set(l.id, l.class_group_id)
      lessonDate.set(l.id, l.scheduled_date)
      totalLessonsByGroup.set(l.class_group_id, (totalLessonsByGroup.get(l.class_group_id) ?? 0) + 1)
    }

    // חריגות קודש: если единица — кафедра кодеша, посещаемость освобождённой
    // студентки на дату её освобождения не учитываем (ни в группе, ни у неё).
    const kodeshExemptions = params.unitId === KODESH_DEPT_ID
      ? await loadKodeshExemptions(sb, [...journeyIdSet])
      : null

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
        if (kodeshExemptions?.hasAny
          && kodeshExemptions.isExempt(r.journey_id, lessonDate.get(r.lesson_id) ?? '')) {
          continue
        }
        const g = attByGroup.get(gid) ?? emptyAtt(); addStatus(g, r.status); attByGroup.set(gid, g)
        const j = attByJourney.get(r.journey_id) ?? emptyAtt(); addStatus(j, r.status); attByJourney.set(r.journey_id, j)
      }
    }

    // 5. Задания групп (в выбранном периоде) → задание→(группа, max_score), всего.
    const assessRows = await fetchAllByIn<{ id: string; class_group_id: string; max_score: number; assessment_date: string | null }>(
      sb, 'assessments', 'id, class_group_id, max_score, assessment_date', 'class_group_id', groupIds,
    )
    const assessGroup = new Map<string, string>()
    const assessMax = new Map<string, number>()
    const totalAssessmentsByGroup = new Map<string, number>()
    for (const a of assessRows) {
      if (!inRange(a.assessment_date, from, to)) continue
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

    // Маршрут חол по студенту (journey_study_tracks → study_tracks.name_he).
    // Деплой-безопасно: таблиц может ещё не быть (42P01) → без маршрутов.
    const trackByJourney = new Map<string, string>()
    try {
      const jids = [...journeyIdSet]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: jt } = await (sb as any)
        .from('journey_study_tracks').select('journey_id, track_id').in('journey_id', jids)
      const trackIds = [...new Set(((jt ?? []) as Array<{ track_id: string | null }>).map(r => r.track_id).filter(Boolean))] as string[]
      if (trackIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: tr } = await (sb as any).from('study_tracks').select('id, name_he').in('id', trackIds)
        const nameById = new Map<string, string>(((tr ?? []) as Array<{ id: string; name_he: string }>).map(t => [t.id, t.name_he]))
        for (const r of (jt ?? []) as Array<{ journey_id: string; track_id: string | null }>) {
          if (r.track_id && nameById.has(r.track_id)) trackByJourney.set(r.journey_id, nameById.get(r.track_id)!)
        }
      }
    } catch { /* нет таблиц — без маршрутов */ }

    const studentsOut = [...journeyIdSet].map(jid => {
      const a = attByJourney.get(jid) ?? emptyAtt()
      const gp = gradePctByJourney.get(jid) ?? []
      return {
        journey_id: jid,
        name: nameByJourney.get(jid) ?? '',
        track: trackByJourney.get(jid) ?? null,
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
