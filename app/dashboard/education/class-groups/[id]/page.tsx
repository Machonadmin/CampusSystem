import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createServerClient } from '@/lib/supabase/server'
import { hasEducationPrivilege, getEducationPrivilegeScope } from '@/lib/education/permissions'
import { getClassGroupTarget } from '@/lib/education/lesson-access'
import { getHeadedUnitIds } from '@/lib/education/unit-access'
import ClassGroupCardClient from './ClassGroupCardClient'

interface Props {
  params: Promise<{ id: string }>
}

/**
 * Серверная обёртка карточки учебной группы.
 *
 * Считает три способности текущего пользователя относительно ЭТОЙ группы
 * (target = department_id группы + teacher_ids из class_teachers) — тот же
 * паттерн, что в карточке студента (students/[id]/page.tsx):
 *   canViewLessons    — education.view_students
 *   canManageLessons  — education.set_lesson_topics
 *   canCorrectAttendance — исправление посещаемости в журнале (решение
 *                       владельца 8, 24.09.2026): superadmin, ראש יחידה
 *                       подразделения группы или mark_attendance со scope='all'
 *                       (менеджер уровня института). Обычный учитель группы —
 *                       только просмотр: отмечает в экране урока.
 *   canViewGrades     — education.view_students (то же право, что и журнал)
 *   canSetGrades      — education.set_grades
 * и передаёт их клиентскому компоненту.
 */
export default async function ClassGroupCardPage(props: Props) {
  const params = await props.params
  const session = await getSession()
  if (!session) redirect('/login')

  const sb = createServerClient()

  let canViewLessons = false
  let canManageLessons = false
  let canCorrectAttendance = false
  let canSetGrades = false

  let target = null
  try {
    target = await getClassGroupTarget(sb, params.id)
  } catch {
    // Невалидный uuid и т.п. — считаем группу не найденной;
    // клиент покажет свой экран «группа не найдена».
  }

  if (target) {
    const deptId = target.department_id ?? null
    let markScope: Awaited<ReturnType<typeof getEducationPrivilegeScope>> = null
    let headedUnitIds: string[] = []
    ;[canViewLessons, canManageLessons, canSetGrades, markScope, headedUnitIds] = await Promise.all([
      hasEducationPrivilege(session, 'view_students', target),
      hasEducationPrivilege(session, 'set_lesson_topics', target),
      hasEducationPrivilege(session, 'set_grades', target),
      // getEducationPrivilegeScope сам возвращает 'all' для superadmin (не студент).
      getEducationPrivilegeScope(session, 'mark_attendance'),
      session.principal === 'student' ? Promise.resolve([]) : getHeadedUnitIds(session.person_id),
    ])
    canCorrectAttendance = markScope === 'all'
      || (deptId !== null && headedUnitIds.includes(deptId))
  }

  // Просмотр оценок — то же право, что и просмотр журнала (view_students).
  const canViewGrades = canViewLessons

  return (
    <ClassGroupCardClient
      groupId={params.id}
      canViewLessons={canViewLessons}
      canManageLessons={canManageLessons}
      canCorrectAttendance={canCorrectAttendance}
      canViewGrades={canViewGrades}
      canSetGrades={canSetGrades}
    />
  )
}
