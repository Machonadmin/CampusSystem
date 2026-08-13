import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import {
  requireEducationPrivilege,
  canDoEducationInAny,
} from '@/lib/education/permissions'
import { ensureSemesterTuitionCharges } from '@/lib/education/semester-tuition'

/**
 * Единый объект «семестр-группа» = class_groups с is_semester=true.
 * Идентичность семестра (маршрут, год, номер, статус) и финансы (школьная плата
 * за семестр, месячная ставка преподавателю) живут на существующей class_groups.
 *
 * ФАЗА 2 — только UI+API, ПИШУЩИЕ новые колонки. Финансовые счета (finance_charges)
 * и выплаты преподавателям НЕ создаются (это фазы 3–4).
 *
 * Все чтения/записи новых колонок деплой-безопасны: если миграция не применена,
 * PostgREST вернёт 42703 (нет колонки) / 42P01 (нет таблицы) — тогда деградируем
 * (пустой список / вставка базовых колонок + warning), а не 500.
 */

/** Untyped-клиент для новых колонок, которых пока нет в сгенерированных типах. */
function u(sb: ReturnType<typeof createServerClient>): SupabaseClient {
  return sb as unknown as SupabaseClient
}

// `*` вместо явного списка колонок — deploy-safe: возвращает name_he/name_en
// сразу после применения миграции class_groups_multilang и просто опускает их
// до неё (не роняет запрос отсутствующей колонкой).
const SEMESTER_GROUP_SELECT = `
  *,
  track:study_tracks(id, name_he, name_ru, name_en),
  department:departments(id, name, name_he, name_en)
`

/**
 * Деплой-безопасно подтягивает year_level (колонка из миграции studies_drilldown).
 * Если миграция ещё не применена (42703/42P01) — возвращает пустую карту, и
 * список семестров продолжает работать (year_level = null у всех).
 */
async function fetchYearLevels(
  sb: ReturnType<typeof createServerClient>,
  groupIds: string[],
): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>()
  if (groupIds.length === 0) return map
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (u(sb).from('class_groups').select('id, year_level').in('id', groupIds) as any)
  if (error) return map
  for (const r of (data ?? []) as Array<{ id: string; year_level: number | null }>) {
    map.set(r.id, r.year_level ?? null)
  }
  return map
}

async function buildCounts(
  sb: ReturnType<typeof createServerClient>,
  groupIds: string[],
): Promise<{ teachersByGroup: Map<string, number>; studentsByGroup: Map<string, number> }> {
  const [teachersRes, enrollsRes] = await Promise.all([
    sb.from('class_teachers').select('class_group_id').in('class_group_id', groupIds),
    sb.from('class_enrollments').select('class_group_id').in('class_group_id', groupIds),
  ])
  if (teachersRes.error) throw teachersRes.error
  if (enrollsRes.error) throw enrollsRes.error

  const teachersByGroup = new Map<string, number>()
  for (const row of teachersRes.data ?? []) {
    teachersByGroup.set(row.class_group_id, (teachersByGroup.get(row.class_group_id) ?? 0) + 1)
  }
  const studentsByGroup = new Map<string, number>()
  for (const row of enrollsRes.data ?? []) {
    studentsByGroup.set(row.class_group_id, (studentsByGroup.get(row.class_group_id) ?? 0) + 1)
  }
  return { teachersByGroup, studentsByGroup }
}

/**
 * GET /api/education/semester-groups
 * Список семестров-групп (class_groups WHERE is_semester = true).
 * Право (чтение): manage_class_groups ИЛИ view_students в любом подразделении.
 * Деплой-безопасно: если колонки is_semester ещё нет (42703/42P01) → пустой список.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const allowed =
      (await canDoEducationInAny(session, 'manage_class_groups')) ||
      (await canDoEducationInAny(session, 'view_students'))
    if (!allowed) return apiError('forbidden', 403)

    const sb = createServerClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: groups, error } = await (u(sb)
      .from('class_groups')
      .select(SEMESTER_GROUP_SELECT)
      .eq('is_semester', true)
      .order('name') as any)

    if (error) {
      if (error.code === '42703' || error.code === '42P01') {
        return NextResponse.json({ semester_groups: [] })
      }
      throw error
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (groups ?? []) as any[]
    if (rows.length === 0) return NextResponse.json({ semester_groups: [] })

    const groupIds = rows.map(g => g.id as string)
    const [{ teachersByGroup, studentsByGroup }, yearLevels] = await Promise.all([
      buildCounts(sb, groupIds),
      fetchYearLevels(sb, groupIds),
    ])

    const result = rows.map(g => ({
      id: g.id,
      name: g.name,
      year_label: g.year_label ?? null,
      term_number: g.term_number ?? null,
      year_level: yearLevels.get(g.id) ?? null,
      sem_status: g.sem_status ?? null,
      tuition_amount: g.tuition_amount ?? null,
      period_start: g.period_start ?? null,
      period_end: g.period_end ?? null,
      study_track: g.track ?? null,
      department: g.department ?? null,
      counts: {
        teachers: teachersByGroup.get(g.id) ?? 0,
        students: studentsByGroup.get(g.id) ?? 0,
      },
    }))

    return NextResponse.json({ semester_groups: result })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code === '42703' || e.code === '42P01') {
      return NextResponse.json({ semester_groups: [] })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

interface TeacherInput { person_id: string; is_primary?: boolean; monthly_rate?: number | null }

/**
 * POST /api/education/semester-groups
 * Создать семестр-группу.
 * Право: manage_class_groups в указанном подразделении.
 *
 * Body: { name (обяз.), year_label?, term_number?, study_track_id?, department_id (обяз.),
 *         tuition_amount?, period_start?, period_end?,
 *         teachers: [{ person_id, is_primary, monthly_rate? }],
 *         student_journey_ids: string[] }
 *
 * Финансовые счета НЕ создаются (фаза 3). tuition_charge_id остаётся null.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      name?: string
      name_he?: string | null
      name_en?: string | null
      year_label?: string | null
      term_number?: number | null
      year_level?: number | null
      study_track_id?: string | null
      department_id?: string
      tuition_amount?: number | null
      period_start?: string | null
      period_end?: string | null
      teachers?: TeacherInput[]
      student_journey_ids?: string[]
    }

    const name = body.name?.trim()
    if (!name) return apiError('title_required', 400)
    if (!body.department_id) return apiError('department_id_required', 400)

    const session = await requireEducationPrivilege('manage_class_groups', { department_id: body.department_id })

    const sb = createServerClient()

    // (2) Вставка class_groups с новыми колонками (untyped). При 42703 —
    // вставляем только базовые колонки и возвращаем warning, чтобы данные не
    // «пропали молча».
    let warning: string | undefined
    const fullInsert: Record<string, unknown> = {
      name,
      department_id: body.department_id,
      subject_id: null,
      is_semester: true,
      sem_status: 'open',
      study_track_id: body.study_track_id ?? null,
      tuition_amount: body.tuition_amount ?? null,
      year_label: body.year_label?.trim() || null,
      term_number: body.term_number ?? null,
      period_start: body.period_start ?? null,
      period_end: body.period_end ?? null,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let group: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ins = await (u(sb).from('class_groups').insert(fullInsert as any).select('id, department_id').single() as any)
    if (ins.error) {
      if (ins.error.code === '42703') {
        const baseInsert: Record<string, unknown> = {
          name,
          department_id: body.department_id,
          period_start: body.period_start ?? null,
          period_end: body.period_end ?? null,
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const insBase = await (u(sb).from('class_groups').insert(baseInsert as any).select('id, department_id').single() as any)
        if (insBase.error) {
          if (insBase.error.code === '23505') return apiError('study_group_name_exists', 409)
          if (insBase.error.code === '23503') return apiError('invalid_reference', 400)
          throw insBase.error
        }
        group = insBase.data
        warning = 'Миграция объединения семестра ещё не применена: сохранены только базовые поля (имя, подразделение, период). Маршрут, год, номер, оплата и статус семестра НЕ сохранены.'
      } else if (ins.error.code === '23505') {
        return apiError('study_group_name_exists', 409)
      } else if (ins.error.code === '23503') {
        return apiError('invalid_reference', 400)
      } else {
        throw ins.error
      }
    } else {
      group = ins.data
    }

    const groupId = group.id as string

    // (2b) year_level (год א/ב/ג/ד) — отдельным деплой-безопасным UPDATE, чтобы
    // отсутствие этой новой колонки не роняло основную вставку с остальными полями.
    if (body.year_level != null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: ylErr } = await (u(sb).from('class_groups').update({ year_level: body.year_level } as any).eq('id', groupId) as any)
      if (ylErr && ylErr.code === '42703') {
        warning = (warning ? warning + ' ' : '') + 'Год (year_level) не сохранён: миграция studies_drilldown ещё не применена.'
      }
    }

    // (2c) Переводы имени — отдельным деплой-безопасным UPDATE.
    if ((body.name_he && body.name_he.trim()) || (body.name_en && body.name_en.trim())) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: trErr } = await (u(sb).from('class_groups').update({ name_he: body.name_he?.trim() || null, name_en: body.name_en?.trim() || null } as any).eq('id', groupId) as any)
      if (trErr && trErr.code === '42703') {
        warning = (warning ? warning + ' ' : '') + 'Переводы имени не сохранены: миграция class_groups_multilang ещё не применена.'
      }
    }

    // (3) Преподаватели class_teachers (с monthly_rate, untyped).
    const teachers = (body.teachers ?? []).filter(t => t.person_id)
    if (teachers.length > 0) {
      const seen = new Set<string>()
      const teacherRows = teachers
        .filter(t => { if (seen.has(t.person_id)) return false; seen.add(t.person_id); return true })
        .map((t, idx) => ({
          class_group_id: groupId,
          teacher_id: t.person_id,
          is_primary: t.is_primary ?? (idx === 0),
          monthly_rate: t.monthly_rate ?? null,
          added_by: session.person_id,
        }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: ctErr } = await u(sb).from('class_teachers').insert(teacherRows as any)
      if (ctErr) {
        // monthly_rate может отсутствовать (миграция не применена) — пробуем без него.
        if (ctErr.code === '42703') {
          const baseRows = teacherRows.map(({ monthly_rate: _mr, ...rest }) => rest)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: ctBaseErr } = await u(sb).from('class_teachers').insert(baseRows as any)
          if (ctBaseErr) {
            warning = (warning ? warning + ' ' : '') + 'Преподаватели добавлены без месячной ставки (колонка monthly_rate отсутствует).'
          } else {
            warning = (warning ? warning + ' ' : '') + 'Месячная ставка преподавателей не сохранена (колонка monthly_rate отсутствует).'
          }
        } else {
          warning = (warning ? warning + ' ' : '') + 'Не удалось добавить преподавателей.'
        }
      }
    }

    // (4) Зачисление студенток class_enrollments (только education_status='student').
    const journeyIds = Array.from(new Set(body.student_journey_ids ?? []))
    if (journeyIds.length > 0) {
      const { data: journeys, error: jErr } = await sb
        .from('education_journeys')
        .select('id, education_status')
        .in('id', journeyIds)
      if (jErr) throw jErr
      const eligible = (journeys ?? []).filter(j => j.education_status === 'student').map(j => j.id)
      if (eligible.length > 0) {
        const rows = eligible.map(journey_id => ({ journey_id, class_group_id: groupId }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insErr } = await sb.from('class_enrollments').insert(rows as any)
        if (insErr && insErr.code !== '23503') throw insErr

        // (5) Фаза 3: привязка = обязательство. Открываем счёт tuition каждой
        // зачисленной студентке (идемпотентно, деплой-безопасно). Возврат при
        // отчислении НЕ делаем (решение фин.отдела).
        const tuition = await ensureSemesterTuitionCharges(
          sb,
          { id: groupId, tuition_amount: body.tuition_amount ?? null, name, year_label: body.year_label ?? null, term_number: body.term_number ?? null },
          eligible,
          session.person_id,
        )
        if (tuition.warning) warning = (warning ? warning + ' ' : '') + tuition.warning
      }
      const skipped = journeyIds.length - eligible.length
      if (skipped > 0) {
        warning = (warning ? warning + ' ' : '') + `${skipped} из выбранных не являются студентками и пропущены.`
      }
    }

    return NextResponse.json({ id: groupId, ...(warning ? { warning } : {}) }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code === '23505') return apiError('study_group_name_exists', 409)
    if (e.code === '23503') return apiError('invalid_reference', 400)
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
