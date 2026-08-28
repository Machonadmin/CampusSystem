import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege, getEducationPrivilegeScope, getUserDepartmentIds, canDoEducationInAny } from '@/lib/education/permissions'
import { fetchAllByIn, loadAbsenceCounts } from '@/lib/education/absence-counts'
import { todayISO } from '@/lib/dates'

/**
 * GET /api/education/at-risk?days=30&min=3
 *
 * Проактивный список «в зоне риска»: студентки (education_status='student') с
 * большим числом пропусков (absent) за последние `days` дней. Чтобы секретарь/
 * руководитель увидел, кому нужно внимание, ещё до того как ситуация станет
 * критичной. Возвращает journey_id + имя + подразделение + absent_count/late_count.
 *
 * Право: superadmin или view_students (любой scope). scope='department' —
 * только свои подразделения; 'all'/superadmin — весь институт. Иначе 403.
 * Deploy-safe: отсутствие таблиц (42P01) → { students: [] }.
 */

function clampInt(raw: string | null, def: number, min: number, max: number): number {
  const n = parseInt(raw ?? '', 10)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, n))
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const isSuper = session.roles.includes('superadmin')
    const allowed = isSuper || await hasEducationPrivilege(session, 'view_students')
    if (!allowed) return apiError('forbidden', 403)

    const scope = isSuper ? 'all' : await getEducationPrivilegeScope(session, 'view_students')
    // Управленческая сводка. Преподаватель (scope='own') раньше проваливался
    // мимо департамент-фильтра и получал студенток «в зоне риска» по всему
    // институту. Теперь — пусто.
    if (scope === 'own') return NextResponse.json({ students: [] })

    const days = clampInt(request.nextUrl.searchParams.get('days'), 30, 1, 365)
    const min = clampInt(request.nextUrl.searchParams.get('min'), 3, 1, 100)
    // Окно «последние N дней» — от СЕГОДНЯ по Asia/Jerusalem (как весь апп),
    // а не по UTC-инстанту: иначе в предрассветном израильском окне граница
    // сдвигалась на день. Шаг назад — по дате (UTC-арифметика на date-only).
    const anchor = new Date(`${todayISO()}T00:00:00Z`)
    anchor.setUTCDate(anchor.getUTCDate() - days)
    const cutoff = anchor.toISOString().slice(0, 10)

    const sb = createServerClient()

    // scope='department' — ограничиваем подразделениями пользователя.
    let myDepts: string[] | null = null
    if (scope === 'department') {
      myDepts = await getUserDepartmentIds(session.person_id)
      if (myDepts.length === 0) return NextResponse.json({ students: [] })
    }

    // Подсчёт пропусков/опозданий — общий помощник (тот же, что у cron-порога),
    // с учётом חריגות קודש. Кандидаты: absent_count >= min.
    const counts = await loadAbsenceCounts(sb, { cutoff, deptIds: myDepts })
    const absentByJourney = new Map<string, number>()
    const lateByJourney = new Map<string, number>()
    for (const [jid, c] of counts) {
      absentByJourney.set(jid, c.absent)
      lateByJourney.set(jid, c.late)
    }

    const candidateIds = [...absentByJourney.entries()]
      .filter(([, c]) => c >= min)
      .map(([jid]) => jid)
    if (candidateIds.length === 0) return NextResponse.json({ students: [] })

    // 4. Оставляем только активных студенток + имя и подразделение.
    const journeyRows = await fetchAllByIn<{
      id: string
      person: { full_name: string | null; hebrew_name: string | null } | null
      department: { id: string; name: string } | null
    }>(
      sb, 'education_journeys',
      'id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name), department:departments!education_journeys_primary_department_id_fkey(id, name)',
      'id', candidateIds, ['id'],
      q => q.eq('education_status', 'student'),
    )

    const students = journeyRows
      .map(j => ({
        journey_id: j.id,
        name: j.person?.hebrew_name || j.person?.full_name || '',
        department: j.department ? { id: j.department.id, name: j.department.name } : null,
        absent_count: absentByJourney.get(j.id) ?? 0,
        late_count: lateByJourney.get(j.id) ?? 0,
      }))
      .sort((a, b) => b.absent_count - a.absent_count)
      .slice(0, 50)

    // Открывать «случай отсутствия» может manage_students / superadmin — флаг
    // управляет кнопкой «פתח טיפול» в карточке «в зоне риска».
    const canOpenCase = isSuper || await canDoEducationInAny(session, 'manage_students')

    return NextResponse.json({ students, days, min, can_open_case: canOpenCase })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code === '42P01') return NextResponse.json({ students: [] })
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
