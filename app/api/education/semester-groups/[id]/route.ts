import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege, hasEducationPrivilege } from '@/lib/education/permissions'
import { ensureSemesterTuitionCharges } from '@/lib/education/semester-tuition'

/**
 * Семестр-группа = class_groups с is_semester=true. Детальная карточка + PATCH.
 * Финансовые счета НЕ создаются (фаза 3). Все обращения к новым колонкам —
 * деплой-безопасны (untyped-клиент + мягкая деградация при 42703/42P01).
 */

function u(sb: ReturnType<typeof createServerClient>): SupabaseClient {
  return sb as unknown as SupabaseClient
}

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  return session
}

// `*` — deploy-safe: подтягивает name_he/name_en после миграции и опускает до неё.
const DETAIL_SELECT = `
  *,
  track:study_tracks(id, name_he, name_ru, name_en),
  department:departments(id, name, name_he, name_en)
`

/**
 * GET /api/education/semester-groups/[id]
 * Полная карточка: поля + преподаватели (с monthly_rate) + зачисленные студентки.
 * Право: view_students в подразделении группы.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await requireAuth()
    const sb = createServerClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: group, error } = await (u(sb)
      .from('class_groups')
      .select(DETAIL_SELECT)
      .eq('id', params.id)
      .maybeSingle() as any)
    if (error) {
      if (error.code === '42703' || error.code === '42P01') return apiError('group_not_found', 404)
      throw error
    }
    if (!group) return apiError('group_not_found', 404)

    const groupDept = (group as { department_id?: string | null }).department_id ?? null
    const canView = await hasEducationPrivilege(
      session, 'view_students', groupDept ? { department_id: groupDept } : undefined,
    )
    if (!canView) return apiError('forbidden', 403)

    // Преподаватели с monthly_rate (untyped). При 42703 — без ставки.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let teacherRows: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tRes = await (u(sb)
      .from('class_teachers')
      .select('teacher_id, is_primary, monthly_rate, person:persons!class_teachers_teacher_id_fkey(id, full_name)')
      .eq('class_group_id', params.id) as any)
    if (tRes.error) {
      if (tRes.error.code === '42703') {
        const tBase = await sb
          .from('class_teachers')
          .select('teacher_id, is_primary, person:persons!class_teachers_teacher_id_fkey(id, full_name)')
          .eq('class_group_id', params.id)
        if (tBase.error) throw tBase.error
        teacherRows = tBase.data ?? []
      } else {
        throw tRes.error
      }
    } else {
      teacherRows = tRes.data ?? []
    }

    const teachers = teacherRows
      .map(row => {
        const person = (row.person as unknown) as { id: string; full_name: string | null } | null
        return person
          ? {
              person_id: person.id,
              full_name: person.full_name,
              is_primary: row.is_primary ?? false,
              monthly_rate: row.monthly_rate ?? null,
            }
          : null
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))

    const { data: enrolls, error: eErr } = await sb
      .from('class_enrollments')
      .select('journey_id')
      .eq('class_group_id', params.id)
    if (eErr) throw eErr

    const journeyIds = (enrolls ?? []).map(r => r.journey_id)
    let students: { journey_id: string; person_id: string; full_name: string | null; hebrew_name: string | null }[] = []
    if (journeyIds.length > 0) {
      const { data: jRows, error: jErr } = await sb
        .from('education_journeys')
        .select('id, person_id, person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name)')
        .in('id', journeyIds)
      if (jErr) throw jErr
      students = (jRows ?? []).map(j => {
        const p = (j.person as unknown) as { id: string; full_name: string | null; hebrew_name: string | null } | null
        return {
          journey_id: j.id,
          person_id: j.person_id,
          full_name: p?.full_name ?? null,
          hebrew_name: p?.hebrew_name ?? null,
        }
      })
    }

    // year_level (новая колонка) — деплой-безопасно отдельным запросом.
    let year_level: number | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ylRes = await (u(sb).from('class_groups').select('year_level').eq('id', params.id).maybeSingle() as any)
    if (!ylRes.error && ylRes.data) year_level = (ylRes.data as { year_level: number | null }).year_level ?? null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = group as any
    return NextResponse.json({
      id: g.id,
      name: g.name,
      department_id: g.department_id,
      study_track_id: g.study_track_id ?? null,
      year_label: g.year_label ?? null,
      year_level,
      term_number: g.term_number ?? null,
      sem_status: g.sem_status ?? null,
      tuition_amount: g.tuition_amount ?? null,
      period_start: g.period_start ?? null,
      period_end: g.period_end ?? null,
      study_track: g.track ?? null,
      department: g.department ?? null,
      teachers,
      students,
      counts: { teachers: teachers.length, students: journeyIds.length },
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

interface TeacherInput { person_id: string; is_primary?: boolean; monthly_rate?: number | null }

/**
 * PATCH /api/education/semester-groups/[id]
 * Обновить поля + синхронизировать преподавателей и студенток.
 * Право: manage_class_groups в подразделении группы.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
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

    const sb = createServerClient()

    const { data: current, error: fetchErr } = await sb
      .from('class_groups')
      .select('department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return apiError('group_not_found', 404)

    const session = await requireEducationPrivilege('manage_class_groups', { department_id: current.department_id })

    const newDepartmentId = body.department_id ?? current.department_id
    if (body.department_id && body.department_id !== current.department_id) {
      await requireEducationPrivilege('manage_class_groups', { department_id: body.department_id })
    }

    let warning: string | undefined

    // ── Обновление полей группы (untyped, новые колонки) ──────────────────
    const fullUpdate: Record<string, unknown> = {}
    if (body.name !== undefined) {
      const n = body.name?.trim()
      if (!n) return apiError('title_not_empty', 400)
      fullUpdate.name = n
    }
    if (body.department_id !== undefined) fullUpdate.department_id = body.department_id
    if (body.study_track_id !== undefined) fullUpdate.study_track_id = body.study_track_id ?? null
    if (body.tuition_amount !== undefined) fullUpdate.tuition_amount = body.tuition_amount ?? null
    if (body.year_label !== undefined) fullUpdate.year_label = body.year_label?.trim() || null
    if (body.term_number !== undefined) fullUpdate.term_number = body.term_number ?? null
    if (body.period_start !== undefined) fullUpdate.period_start = body.period_start
    if (body.period_end !== undefined) fullUpdate.period_end = body.period_end

    if (Object.keys(fullUpdate).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: upErr } = await u(sb).from('class_groups').update(fullUpdate as any).eq('id', params.id)
      if (upErr) {
        if (upErr.code === '42703') {
          // Оставляем только базовые колонки (name, department_id, period_*).
          const baseUpdate: Record<string, unknown> = {}
          if (fullUpdate.name !== undefined) baseUpdate.name = fullUpdate.name
          if (fullUpdate.department_id !== undefined) baseUpdate.department_id = fullUpdate.department_id
          if (fullUpdate.period_start !== undefined) baseUpdate.period_start = fullUpdate.period_start
          if (fullUpdate.period_end !== undefined) baseUpdate.period_end = fullUpdate.period_end
          if (Object.keys(baseUpdate).length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: baseErr } = await u(sb).from('class_groups').update(baseUpdate as any).eq('id', params.id)
            if (baseErr) {
              if (baseErr.code === '23505') return apiError('group_name_exists', 409)
              throw baseErr
            }
          }
          warning = 'Миграция объединения семестра ещё не применена: маршрут, год, номер, оплата и статус НЕ обновлены.'
        } else if (upErr.code === '23505') {
          return apiError('group_name_exists', 409)
        } else if (upErr.code === '23503') {
          return apiError('invalid_reference_generic', 400)
        } else {
          throw upErr
        }
      }
    }
    void newDepartmentId

    // year_level — отдельным деплой-безопасным UPDATE (новая колонка).
    if (body.year_level !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: ylErr } = await (u(sb).from('class_groups').update({ year_level: body.year_level ?? null } as any).eq('id', params.id) as any)
      if (ylErr && ylErr.code === '42703') warning = (warning ? warning + ' ' : '') + 'Год (year_level) не обновлён: миграция studies_drilldown не применена.'
    }

    // Переводы имени — отдельным деплой-безопасным UPDATE.
    if (body.name_he !== undefined || body.name_en !== undefined) {
      const tr: Record<string, string | null> = {}
      if (body.name_he !== undefined) tr.name_he = body.name_he?.trim() || null
      if (body.name_en !== undefined) tr.name_en = body.name_en?.trim() || null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: trErr } = await (u(sb).from('class_groups').update(tr as any).eq('id', params.id) as any)
      if (trErr && trErr.code === '42703') warning = (warning ? warning + ' ' : '') + 'Переводы имени не обновлены: миграция class_groups_multilang не применена.'
    }

    // ── Синхронизация преподавателей ──────────────────────────────────────
    if (body.teachers !== undefined) {
      const desired = new Map<string, TeacherInput>()
      for (const t of body.teachers) {
        if (t.person_id) desired.set(t.person_id, t)
      }

      const { data: existing, error: exErr } = await sb
        .from('class_teachers')
        .select('teacher_id')
        .eq('class_group_id', params.id)
      if (exErr) throw exErr
      const existingIds = new Set((existing ?? []).map(r => r.teacher_id))

      const toRemove = [...existingIds].filter(id => !desired.has(id))
      const toAdd = [...desired.keys()].filter(id => !existingIds.has(id))
      const toUpdate = [...desired.keys()].filter(id => existingIds.has(id))

      if (toRemove.length > 0) {
        const { error: delErr } = await sb
          .from('class_teachers')
          .delete()
          .eq('class_group_id', params.id)
          .in('teacher_id', toRemove)
        if (delErr) throw delErr
      }

      if (toAdd.length > 0) {
        const addRows = toAdd.map((id, idx) => {
          const t = desired.get(id)!
          return {
            class_group_id: params.id,
            teacher_id: id,
            is_primary: t.is_primary ?? false,
            monthly_rate: t.monthly_rate ?? null,
            added_by: session.person_id,
          }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: addErr } = await u(sb).from('class_teachers').insert(addRows as any)
        if (addErr) {
          if (addErr.code === '42703') {
            const baseRows = addRows.map(({ monthly_rate: _mr, ...rest }) => rest)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: addBaseErr } = await sb.from('class_teachers').insert(baseRows as any)
            if (addBaseErr) throw addBaseErr
            warning = (warning ? warning + ' ' : '') + 'Месячная ставка преподавателей не сохранена (колонка monthly_rate отсутствует).'
          } else {
            throw addErr
          }
        }
      }

      for (const id of toUpdate) {
        const t = desired.get(id)!
        const upd: Record<string, unknown> = {
          is_primary: t.is_primary ?? false,
          monthly_rate: t.monthly_rate ?? null,
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: uErr } = await u(sb)
          .from('class_teachers')
          .update(upd as any)
          .eq('class_group_id', params.id)
          .eq('teacher_id', id)
        if (uErr) {
          if (uErr.code === '42703') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: uBaseErr } = await u(sb)
              .from('class_teachers')
              .update({ is_primary: t.is_primary ?? false } as any)
              .eq('class_group_id', params.id)
              .eq('teacher_id', id)
            if (uBaseErr) throw uBaseErr
            warning = (warning ? warning + ' ' : '') + 'Месячная ставка преподавателей не сохранена (колонка monthly_rate отсутствует).'
          } else {
            throw uErr
          }
        }
      }
    }

    // ── Синхронизация студенток (только education_status='student') ────────
    if (body.student_journey_ids !== undefined) {
      const desiredIds = Array.from(new Set(body.student_journey_ids))

      const { data: existing, error: exErr } = await sb
        .from('class_enrollments')
        .select('journey_id')
        .eq('class_group_id', params.id)
      if (exErr) throw exErr
      const existingIds = new Set((existing ?? []).map(r => r.journey_id))

      const toRemove = [...existingIds].filter(id => !desiredIds.includes(id))
      const toAddRaw = desiredIds.filter(id => !existingIds.has(id))

      if (toRemove.length > 0) {
        const { error: delErr } = await sb
          .from('class_enrollments')
          .delete()
          .eq('class_group_id', params.id)
          .in('journey_id', toRemove)
        if (delErr) throw delErr
      }

      if (toAddRaw.length > 0) {
        const { data: journeys, error: jErr } = await sb
          .from('education_journeys')
          .select('id, education_status')
          .in('id', toAddRaw)
        if (jErr) throw jErr
        const eligible = (journeys ?? []).filter(j => j.education_status === 'student').map(j => j.id)
        if (eligible.length > 0) {
          const rows = eligible.map(journey_id => ({ journey_id, class_group_id: params.id }))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: insErr } = await sb.from('class_enrollments').insert(rows as any)
          if (insErr && insErr.code !== '23503') throw insErr

          // Фаза 3: привязка = обязательство → открываем счёт tuition только для
          // ВНОВЬ добавленных студенток (идемпотентно). Отчисление денег не трогает.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const gInfo = await (u(sb).from('class_groups')
            .select('tuition_amount, name, year_label, term_number')
            .eq('id', params.id).maybeSingle() as any)
          if (!gInfo.error && gInfo.data) {
            const tuition = await ensureSemesterTuitionCharges(
              sb,
              { id: params.id, tuition_amount: gInfo.data.tuition_amount ?? null, name: gInfo.data.name ?? null, year_label: gInfo.data.year_label ?? null, term_number: gInfo.data.term_number ?? null },
              eligible,
              session.person_id,
            )
            if (tuition.warning) warning = (warning ? warning + ' ' : '') + tuition.warning
          }
        }
        const skipped = toAddRaw.length - eligible.length
        if (skipped > 0) {
          warning = (warning ? warning + ' ' : '') + `${skipped} из выбранных не являются студентками и пропущены.`
        }
      }
    }

    return NextResponse.json({ ok: true, id: params.id, ...(warning ? { warning } : {}) })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
