import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { round1, attendancePercent } from '@/lib/education/metrics'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  return session
}

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '22P02') return { status: 400, message: serverT('invalid_id') }
  if (error.code === '23503') return { status: 400, message: serverT('invalid_reference') }
  return { status: 500, message: error.message ?? serverT('db_error') }
}

// Размер страницы для агрегаций. PostgREST молча обрезает выдачу на db-max-rows
// (~1000). Уроков/заданий над видимыми группами может быть больше — тогда единый
// select без .range() дал бы неверные суммарные счётчики. Читаем постранично.
const PAGE = 1000

// Учебная группа студента (из class_enrollments → class_groups + справочники).
type EnrolledGroup = {
  id: string
  name: string
  level: string | null
  subject: { id: string; name: string; name_he: string | null } | null
  department: { id: string; name: string } | null
}

/**
 * GET /api/education/journeys/[id]/report
 *
 * Успеваемость студента (journey): по каждой учебной группе, куда он записан,
 * — посещаемость и оценки; плюс сводка по всем видимым группам. Только чтение
 * и агрегация, новых таблиц нет.
 *
 * Доступ (см. подробный разбор в docs/отчёте):
 *   1. Верхний гейт — как карточка студента: view_students в department студента.
 *      Это пропускает scope='all' и подходящий scope='department'.
 *   2. Пофильтр по группам — для КАЖДОЙ группы студента строку включаем, только
 *      если hasEducationPrivilege('view_students', target группы). Так учитель
 *      (scope='own') видит строки только своих групп; недоступные группы молча
 *      опускаются, без общего 403.
 *   3. Итог: 403 только если пользователь не проходит верхний гейт И не видит
 *      ни одной группы студента. Иначе — 200 с видимыми группами (возможно 0).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    const sb = createServerClient()

    // Байпас для студентки: она видит СВОЙ отчёт (все свои группы) без staff-прав,
    // но ТОЛЬКО свою journey. Иначе — 403.
    const isOwnerStudent =
      session.principal === 'student' && session.student_journey_id === params.id
    if (session.principal === 'student' && !isOwnerStudent) {
      return apiError('forbidden', 403)
    }

    // 1. Journey существует?
    const { data: journey, error: jErr } = await sb
      .from('education_journeys')
      .select('id, primary_department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (jErr) throw jErr
    if (!journey) return apiError('journey_not_found', 404)

    // 2. Группы, в которые записан студент (+ имена предмета/подразделения).
    const { data: enrollments, error: enErr } = await sb
      .from('class_enrollments')
      .select(`
        class_group_id,
        class_group:class_groups(
          id, name, level,
          subject:subjects(id, name, name_he),
          department:departments(id, name)
        )
      `)
      .eq('journey_id', params.id)
    if (enErr) throw enErr

    const enrolledGroups: EnrolledGroup[] = (enrollments ?? [])
      .map(e => (e.class_group as unknown) as EnrolledGroup | null)
      .filter((g): g is EnrolledGroup => g !== null)

    const groupIds = enrolledGroups.map(g => g.id)

    // teacher_ids по каждой группе — для target проверки scope='own'/'department'.
    const teachersByGroup = new Map<string, string[]>()
    if (groupIds.length > 0) {
      const { data: ctRows, error: ctErr } = await sb
        .from('class_teachers')
        .select('class_group_id, teacher_id')
        .in('class_group_id', groupIds)
      if (ctErr) throw ctErr
      for (const r of ctRows ?? []) {
        const arr = teachersByGroup.get(r.class_group_id) ?? []
        arr.push(r.teacher_id)
        teachersByGroup.set(r.class_group_id, arr)
      }
    }

    // Студентка видит все свои группы; staff — только те, на которые есть права.
    const visible: EnrolledGroup[] = []
    if (isOwnerStudent) {
      visible.push(...enrolledGroups)
    } else {
      // Верхний гейт (как карточка студента). Он же прогревает кэш прав,
      // поэтому дальнейшие пофильтровые проверки — попадания в кэш.
      const deptGate = await hasEducationPrivilege(session, 'view_students', {
        department_id: journey.primary_department_id ?? undefined,
      })

      // Пофильтр по группам: строку видно, если есть право view_students на target группы.
      for (const g of enrolledGroups) {
        const ok = await hasEducationPrivilege(session, 'view_students', {
          department_id: g.department?.id,
          teacher_ids: teachersByGroup.get(g.id) ?? [],
        })
        if (ok) visible.push(g)
      }

      // 403 только если ни верхний гейт, ни одна группа не доступны.
      if (!deptGate && visible.length === 0) {
        return apiError('forbidden', 403)
      }
    }

    const visibleGroupIds = visible.map(g => g.id)

    // 3. Агрегация — по одному запросу на таблицу над видимыми группами.
    type Att = { present: number; late: number; absent: number }
    const attByGroup = new Map<string, Att>()
    const totalLessonsByGroup = new Map<string, number>()
    const lessonToGroup = new Map<string, string>()

    type AssessmentMini = { assessment_id: string; title: string; max_score: number; assessment_date: string | null }
    const assessmentsByGroup = new Map<string, AssessmentMini[]>()
    const assessmentGroup = new Map<string, string>()
    const gradeByAssessment = new Map<string, number>()

    if (visibleGroupIds.length > 0) {
      // Уроки (только не отменённые) — постранично, чтобы не обрезаться на
      // db-max-rows и не занизить total_lessons.
      let lFrom = 0
      for (;;) {
        const { data: lessons, error: lErr } = await sb
          .from('lessons')
          .select('id, class_group_id')
          .eq('is_cancelled', false)
          .in('class_group_id', visibleGroupIds)
          .order('id', { ascending: true })
          .range(lFrom, lFrom + PAGE - 1)
        if (lErr) throw lErr
        const rows = lessons ?? []
        for (const l of rows) {
          lessonToGroup.set(l.id, l.class_group_id)
          totalLessonsByGroup.set(l.class_group_id, (totalLessonsByGroup.get(l.class_group_id) ?? 0) + 1)
        }
        if (rows.length < PAGE) break
        lFrom += PAGE
      }

      // Посещаемость этого студента над этими уроками.
      const lessonIds = Array.from(lessonToGroup.keys())
      if (lessonIds.length > 0) {
        const { data: att, error: aErr } = await sb
          .from('attendance')
          .select('lesson_id, status')
          .eq('journey_id', params.id)
          .in('lesson_id', lessonIds)
        if (aErr) throw aErr
        for (const row of att ?? []) {
          const gid = lessonToGroup.get(row.lesson_id)
          if (!gid) continue
          const a = attByGroup.get(gid) ?? { present: 0, late: 0, absent: 0 }
          if (row.status === 'absent') a.absent++
          else if (row.status === 'late') a.late++
          else a.present++ // present (и любые старые статусы) — как присутствие
          attByGroup.set(gid, a)
        }
      }

      // Задания видимых групп — постранично, чтобы не обрезаться на db-max-rows
      // и не потерять задания/занизить total_assessments.
      let asFrom = 0
      for (;;) {
        const { data: assessments, error: asErr } = await sb
          .from('assessments')
          .select('id, class_group_id, title, max_score, assessment_date')
          .in('class_group_id', visibleGroupIds)
          .order('assessment_date', { ascending: false, nullsFirst: false })
          .order('id', { ascending: true })
          .range(asFrom, asFrom + PAGE - 1)
        if (asErr) throw asErr
        const rows = assessments ?? []
        for (const a of rows) {
          assessmentGroup.set(a.id, a.class_group_id)
          const arr = assessmentsByGroup.get(a.class_group_id) ?? []
          arr.push({
            assessment_id: a.id,
            title: a.title,
            max_score: Number(a.max_score),
            assessment_date: a.assessment_date,
          })
          assessmentsByGroup.set(a.class_group_id, arr)
        }
        if (rows.length < PAGE) break
        asFrom += PAGE
      }

      // Оценки этого студента над этими заданиями.
      const assessmentIds = Array.from(assessmentGroup.keys())
      if (assessmentIds.length > 0) {
        const { data: grades, error: gErr } = await sb
          .from('grades')
          .select('assessment_id, score')
          .eq('journey_id', params.id)
          .in('assessment_id', assessmentIds)
        if (gErr) throw gErr
        for (const row of grades ?? []) {
          gradeByAssessment.set(row.assessment_id, Number(row.score))
        }
      }
    }

    // 4. Сборка по группам + сводка.
    let sumPresent = 0, sumAbsent = 0, sumLate = 0, sumMarked = 0, sumTotalLessons = 0
    let sumGraded = 0, sumTotalAssessments = 0
    const allGradePercents: number[] = []

    const groups = visible.map(g => {
      const a = attByGroup.get(g.id) ?? { present: 0, late: 0, absent: 0 }
      const marked = a.present + a.late + a.absent
      const totalLessons = totalLessonsByGroup.get(g.id) ?? 0
      // Веса: absent=1, late=0.5. Опоздание стоит половину пропуска.
      const attendancePct = attendancePercent(a)

      const groupAssessments = assessmentsByGroup.get(g.id) ?? []
      const totalAssessments = groupAssessments.length
      const assessmentsOut = groupAssessments.map(as => ({
        assessment_id: as.assessment_id,
        title: as.title,
        max_score: as.max_score,
        assessment_date: as.assessment_date,
        score: gradeByAssessment.has(as.assessment_id) ? gradeByAssessment.get(as.assessment_id)! : null,
      }))
      const gradePercents: number[] = []
      for (const as of groupAssessments) {
        if (gradeByAssessment.has(as.assessment_id) && as.max_score > 0) {
          gradePercents.push((gradeByAssessment.get(as.assessment_id)! / as.max_score) * 100)
        }
      }
      const gradedCount = gradePercents.length
      const gradeAverage = gradedCount === 0
        ? null
        : round1(gradePercents.reduce((s, x) => s + x, 0) / gradedCount)

      sumPresent += a.present; sumAbsent += a.absent; sumLate += a.late
      sumMarked += marked; sumTotalLessons += totalLessons
      sumGraded += gradedCount; sumTotalAssessments += totalAssessments
      allGradePercents.push(...gradePercents)

      return {
        class_group_id: g.id,
        name: g.name,
        level: g.level,
        subject: g.subject,
        department: g.department,
        attendance: {
          present: a.present, late: a.late, absent: a.absent,
          marked, total_lessons: totalLessons,
          percent: attendancePct,
        },
        grades: {
          graded_count: gradedCount,
          total_assessments: totalAssessments,
          average: gradeAverage,
          assessments: assessmentsOut,
        },
      }
    })

    const summary = {
      visible_group_count: groups.length,
      attendance: {
        present: sumPresent, late: sumLate, absent: sumAbsent,
        marked: sumMarked, total_lessons: sumTotalLessons,
        percent: attendancePercent({ present: sumPresent, late: sumLate, absent: sumAbsent }),
      },
      grades: {
        graded_count: sumGraded,
        total_assessments: sumTotalAssessments,
        average: allGradePercents.length === 0
          ? null
          : round1(allGradePercents.reduce((s, x) => s + x, 0) / allGradePercents.length),
      },
    }

    return NextResponse.json({ journey_id: params.id, summary, groups })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
