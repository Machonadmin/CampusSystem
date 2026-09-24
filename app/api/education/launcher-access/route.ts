import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny, canManageEducationInAny, getEducationPrivilegeScope, hasEducationPrivilege } from '@/lib/education/permissions'
import { canManageUnit } from '@/lib/education/unit-access'
import { canManageKodesh } from '@/lib/education/kodesh-access'
import { hasFinancePrivilege } from '@/lib/finance/permissions'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'
import { headsOnlyKodesh } from '@/lib/education/kodesh-workspace'
import { isChavrutaTeacher } from '@/lib/chavruta/teachers'
import { createServerClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/handler'

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
 * Экраны модуля иудаики и прочие пункты (решение владельца: прятать карточку,
 * если экран всё равно покажет «אין לך הרשאה») — зеркало проверки главного GET:
 *   kodesh_home     → canManageKodesh (GET /api/education/kodesh/home)
 *   kodesh_rav      → GET teacher-approvals ИЛИ GET teacher-quotas (экран =
 *                     ForbiddenState только если закрыты оба)
 *   track_catalog   → hasEducationPrivilege manage_tracks (GET study-tracks?includeInactive=1)
 *   no_lesson_days  → canManageEducationInAny manage_class_groups (GET no-lesson-days)
 *   student_alerts  → canDoEducationInAny view_students ИЛИ manage_alerts (GET alerts)
 *   finance_admin   → GET finance/settings ИЛИ GET finance/discount-approvals
 *                     (экран без ForbiddenState; без обоих — пустая страница)
 *   «קורסי קודש» гейта нет: её GET class-groups открыт любому вошедшему.
 *   track_assignment → canManageEducationInAny manage_students (GET track-assignment:
 *                     scope 'department'/'all'; не карточка, а ссылки дашборда
 *                     «ממתינות לשיבוץ»)
 * Fail-closed: если проверка права упала — это право считается НЕ выданным
 * (false). Раньше ошибка оставляла карточку видимой, и клик вёл в 403.
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
        teacher_home: false, students_view_all: true, students_manage_all: true,
        restrict_to_kodesh: false,
        kodesh_home: true, kodesh_rav: true, track_catalog: true, no_lesson_days: true,
        student_alerts: true, finance_admin: true, create_kodesh_course: true,
        track_assignment: true,
      })
    }

    const sb = createServerClient()
    // Fail-closed: упавшая проверка = права нет (false / scope null), а не 500
    // на весь ответ (клиент тогда показал бы все карточки).
    const safe = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
      p.catch((err: unknown) => {
        console.error('[launcher-access] access check failed', err)
        return fallback
      })
    // ВАЖНО: управленческие карточки гейтим на manage-уровень (scope
    // 'department'/'all'), а НЕ canDoEducationInAny (который true и для 'own').
    // Иначе преподаватель (view_students='own' — только свои группы) видел бы
    // שיבוץ / מסלולים / דוחות / כל התלמידות. Преподаватель управленческих
    // карточек не видит вовсе.
    const [
      viewStudentsMgr, manageStudents, manageSubjects,
      manageStudyGroups, kodesh, chavruta, classGroupsScope, viewStudentsAny,
      viewStudentsScope, manageStudentsScope,
      manageKodesh, manageClassTeachers, approveKodeshTeacher, setTeacherQuota,
      manageTracks, manageClassGroupsMgr, manageAlerts,
      finView, finViewBalance, finManageBudget, finApproveDiscount, manageEnrollmentsMgr,
      createKodeshCourse,
    ] = await Promise.all([
      safe(canManageEducationInAny(session, 'view_students'), false),
      safe(canManageEducationInAny(session, 'manage_students'), false),
      safe(canManageEducationInAny(session, 'manage_subjects'), false),
      safe(canManageEducationInAny(session, 'manage_study_groups'), false),
      safe(canManageUnit(session, KODESH_DEPT_ID), false),
      safe(isChavrutaTeacher(sb, session.person_id), false),
      safe(getEducationPrivilegeScope(session, 'manage_class_groups'), null),
      safe(canDoEducationInAny(session, 'view_students'), false),
      safe(getEducationPrivilegeScope(session, 'view_students'), null),
      safe(getEducationPrivilegeScope(session, 'manage_students'), null),
      // ↓ зеркала проверок главного GET экранов (см. шапку файла)
      safe(canManageKodesh(session), false),
      safe(canManageEducationInAny(session, 'manage_class_teachers'), false),
      safe(canDoEducationInAny(session, 'approve_kodesh_teacher'), false),
      safe(canDoEducationInAny(session, 'set_teacher_quota'), false),
      safe(hasEducationPrivilege(session, 'manage_tracks'), false),
      safe(canManageEducationInAny(session, 'manage_class_groups'), false),
      safe(hasEducationPrivilege(session, 'manage_alerts'), false),
      safe(hasFinancePrivilege(session, 'view'), false),
      safe(hasFinancePrivilege(session, 'view_student_balance'), false),
      safe(hasFinancePrivilege(session, 'manage_budget'), false),
      safe(hasFinancePrivilege(session, 'approve_discount'), false),
      safe(canManageEducationInAny(session, 'manage_enrollments'), false),
      // Не карточка, а флаг для экрана «קורסי קודש»: кнопка «+ קורס» — зеркало
      // проверки POST /api/education/semester-groups/[id]/courses для кафедры кодеша.
      safe(hasEducationPrivilege(session, 'create_kodesh_course', { department_id: KODESH_DEPT_ID }), false),
    ])
    // Видит ли всех студенток института (view='all') и может ли всеми управлять
    // (manage='all'). У главы кафедры кодеша view='all', но manage='department' —
    // клиент по этой паре прячет действия, которые он не сможет применить к
    // студенткам вне кодеша (класс/маршрут/переход года/закрытие), оставляя кодеш.
    const students_view_all = viewStudentsScope === 'all'
    const students_manage_all = manageStudentsScope === 'all'
    // «Видит всех, но управляет только своим юнитом» (глава кафедры кодеша).
    // Ему НЕ показываем карточки светского УПРАВЛЕНИЯ — «שיבוץ» (расстановка по
    // классам) и «שיבוץ מסלולים» (маршруты): это управление чужими юнитами,
    // которое он всё равно не сможет применить. Оставляем кодеш + управление
    // преподаванием кодеша + отчёты (владелец: «קודש + ניהול הוראת הקודש»).
    // Решение владельца (24.09.2026): сужаем только того, кто отвечает ТОЛЬКО за
    // кодеш. Глава кодеша, который возглавляет и другие единицы (директор
    // института), видит светские учёбы полностью.
    const restrictToKodesh = students_view_all && !students_manage_all
      // Сбой проверки → сужаем (true): fail-closed прячет, а не открывает.
      && kodesh && await safe(headsOnlyKodesh(session.person_id), true)
    // Карточка «סמסטרים» ведёт на ИНСТИТУТСКИЕ семестры (общая с финансами таблица
    // year/term), которыми управляют только на уровне всего института (scope='all',
    // как в /api/education/semesters). Менеджер юнита (scope='department') работает
    // со своими «קבוצות סמסטר» — поэтому эту карточку ему не показываем.
    const semesters = classGroupsScope === 'all'

    const isManager = viewStudentsMgr || manageStudents || manageSubjects
      || manageStudyGroups || semesters || kodesh
    // Преподаватель: НЕ менеджер, но имеет преподавательский доступ (view_students
    // со scope='own' или ведёт хеврусу) → показываем ему домашний экран учителя.
    const teacher_home = !isManager && (viewStudentsAny || chavruta)

    return NextResponse.json({
      assignment: viewStudentsMgr && !restrictToKodesh,
      tracks: viewStudentsMgr && !restrictToKodesh,
      kodesh,
      teachers_hours: viewStudentsMgr,
      teacher_attendance: manageStudents,
      absences: manageStudents,
      teaching_surveys: manageStudents,
      chavruta,
      semesters,
      structure: manageSubjects,
      units: manageStudyGroups,
      reports: viewStudentsMgr,
      teacher_home,
      students_view_all,
      students_manage_all,
      restrict_to_kodesh: restrictToKodesh,
      kodesh_home: manageKodesh,
      kodesh_rav: (manageClassTeachers || approveKodeshTeacher)
        || (manageClassTeachers || setTeacherQuota),
      track_catalog: manageTracks,
      no_lesson_days: manageClassGroupsMgr,
      student_alerts: viewStudentsAny || manageAlerts,
      finance_admin: (finView || finViewBalance || finManageBudget)
        || (finView || finApproveDiscount || manageEnrollmentsMgr),
      create_kodesh_course: createKodeshCourse,
      track_assignment: manageStudents,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
