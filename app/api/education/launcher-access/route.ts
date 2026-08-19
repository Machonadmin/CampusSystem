import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny, getEducationPrivilegeScope } from '@/lib/education/permissions'
import { canManageUnit } from '@/lib/education/unit-access'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'
import { isChavrutaTeacher } from '@/lib/chavruta/teachers'
import { createServerClient } from '@/lib/supabase/server'

/**
 * GET /api/education/launcher-access — какие карточки пусковой панели «Учёбы»
 * вправе видеть текущий пользователь. До сих пор ВСЕ карточки (включая «שיבוץ
 * קודש» и «הערכת הוראה») показывались каждому, кто вошёл в модуль, — владелец
 * спросил: «почему аחראי קולג видит שיבוץ קודש?». Теперь каждая карточка скрыта,
 * если у пользователя нет права, которое всё равно проверяет её API (клик по
 * скрытой карточке дал бы 403). superadmin видит всё.
 *
 * Право на карточку = ровно то, что энфорсит её эндпойнт:
 *   assignment/tracks/teachers_hours/reports → view_students
 *   teacher_attendance/absences/teaching_surveys → manage_students
 *   kodesh → canManageUnit(KODESH_DEPT_ID)
 *   semesters → manage_class_groups · structure → manage_subjects
 *   units → manage_study_groups · chavruta → преподаватель хеврусы
 * Deploy-безопасно: при любой ошибке карточка не скрывается (fail-open).
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: serverT('unauthorized') }, { status: 401 })

    if (session.roles.includes('superadmin')) {
      return NextResponse.json({
        assignment: true, tracks: true, kodesh: true, teachers_hours: true,
        teacher_attendance: true, absences: true, teaching_surveys: true,
        chavruta: true, semesters: true, structure: true, units: true, reports: true,
      })
    }

    const sb = createServerClient()
    const [
      viewStudents, manageStudents, manageSubjects,
      manageStudyGroups, kodesh, chavruta, classGroupsScope,
    ] = await Promise.all([
      canDoEducationInAny(session, 'view_students'),
      canDoEducationInAny(session, 'manage_students'),
      canDoEducationInAny(session, 'manage_subjects'),
      canDoEducationInAny(session, 'manage_study_groups'),
      canManageUnit(session, KODESH_DEPT_ID),
      isChavrutaTeacher(sb, session.person_id).catch(() => false),
      getEducationPrivilegeScope(session, 'manage_class_groups'),
    ])
    // Карточка «סמסטרים» ведёт на ИНСТИТУТСКИЕ семестры (общая с финансами таблица
    // year/term), которыми управляют только на уровне всего института (scope='all',
    // как в /api/education/semesters). Менеджер юнита (scope='department') работает
    // со своими «קבוצות סמסטר» — поэтому эту карточку ему не показываем.
    const semesters = classGroupsScope === 'all'

    return NextResponse.json({
      assignment: viewStudents,
      tracks: viewStudents,
      kodesh,
      teachers_hours: viewStudents,
      teacher_attendance: manageStudents,
      absences: manageStudents,
      teaching_surveys: manageStudents,
      chavruta,
      semesters,
      structure: manageSubjects,
      units: manageStudyGroups,
      reports: viewStudents,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
