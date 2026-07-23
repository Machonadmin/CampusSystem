import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createServerClient } from '@/lib/supabase/server'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { getClassGroupTarget } from '@/lib/education/lesson-access'
import ClassGroupCardClient from './ClassGroupCardClient'

interface Props {
  params: { id: string }
}

/**
 * Серверная обёртка карточки учебной группы.
 *
 * Считает три способности текущего пользователя относительно ЭТОЙ группы
 * (target = department_id группы + teacher_ids из class_teachers) — тот же
 * паттерн, что в карточке студента (students/[id]/page.tsx):
 *   canViewLessons    — education.view_students
 *   canManageLessons  — education.set_lesson_topics
 *   canMarkAttendance — education.mark_attendance
 *   canViewGrades     — education.view_students (то же право, что и журнал)
 *   canSetGrades      — education.set_grades
 * и передаёт их клиентскому компоненту.
 */
export default async function ClassGroupCardPage({ params }: Props) {
  const session = await getSession()
  if (!session) redirect('/login')

  const sb = createServerClient()

  let canViewLessons = false
  let canManageLessons = false
  let canMarkAttendance = false
  let canSetGrades = false

  let target = null
  try {
    target = await getClassGroupTarget(sb, params.id)
  } catch {
    // Невалидный uuid и т.п. — считаем группу не найденной;
    // клиент покажет свой экран «группа не найдена».
  }

  if (target) {
    ;[canViewLessons, canManageLessons, canMarkAttendance, canSetGrades] = await Promise.all([
      hasEducationPrivilege(session, 'view_students', target),
      hasEducationPrivilege(session, 'set_lesson_topics', target),
      hasEducationPrivilege(session, 'mark_attendance', target),
      hasEducationPrivilege(session, 'set_grades', target),
    ])
  }

  // Просмотр оценок — то же право, что и просмотр журнала (view_students).
  const canViewGrades = canViewLessons

  return (
    <ClassGroupCardClient
      groupId={params.id}
      canViewLessons={canViewLessons}
      canManageLessons={canManageLessons}
      canMarkAttendance={canMarkAttendance}
      canViewGrades={canViewGrades}
      canSetGrades={canSetGrades}
    />
  )
}
