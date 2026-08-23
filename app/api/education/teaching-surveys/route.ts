import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny, getEducationPrivilegeScope, getUserDepartmentIds, hasEducationPrivilege } from '@/lib/education/permissions'
import { u } from '@/lib/education/teaching-surveys'

/**
 * הערכת הוראה — сборы обратной связи о преподавании.
 *   GET  → список сборов, ВИДИМЫХ этому менеджеру (по подразделению).
 *   POST { title, department_id? } → создать сбор для подразделения (закрыт).
 * Доступ: manage_students В ПОДРАЗДЕЛЕНИИ сбора / superadmin. Deploy-safe.
 *
 * Область видимости (решение владельца «רק המחלקה שלו»): superadmin и менеджер
 * со scope='all' видят/ведут все сборы; менеджер со scope='department' — только
 * сборы своих подразделений. Legacy-сборы без department_id — только для
 * scope='all'/superadmin.
 */
async function requireManager() {
  const session = await getSession()
  if (!session) return { error: apiError('unauthorized', 401) }
  if (session.principal === 'student') return { error: apiError('forbidden', 403) }
  const ok = session.roles.includes('superadmin') || await canDoEducationInAny(session, 'manage_students')
  if (!ok) return { error: apiError('forbidden', 403) }
  return { session }
}

export async function GET() {
  try {
    const gate = await requireManager()
    if (gate.error) return gate.error
    const session = gate.session!
    const sb = createServerClient()
    try {
      // department_id — новая колонка (deploy-safe: при 42703 читаем без неё).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let raw = await (u(sb).from('teaching_surveys')
        .select('id, title, is_open, created_at, department_id').order('created_at', { ascending: false }) as any)
      let hasDept = true
      if (raw.error && raw.error.code === '42703') {
        hasDept = false
        raw = await u(sb).from('teaching_surveys').select('id, title, is_open, created_at').order('created_at', { ascending: false })
      }
      if (raw.error) throw raw.error
      let rows = (raw.data ?? []) as Array<{ id: string; title: string; is_open: boolean; created_at: string; department_id?: string | null }>

      // Скоуп по подразделению. Только если колонка есть — иначе (до миграции)
      // ведём себя как раньше (общий gate уже применён).
      if (hasDept) {
        const scopeAll = session.roles.includes('superadmin')
          || (await getEducationPrivilegeScope(session, 'manage_students')) === 'all'
        if (!scopeAll) {
          const myDepts = new Set(await getUserDepartmentIds(session.person_id))
          rows = rows.filter(r => r.department_id != null && myDepts.has(r.department_id))
        }
      }

      // Кол-во откликов на сбор — для списка.
      const counts = new Map<string, number>()
      if (rows.length) {
        const { data: resp } = await u(sb).from('teaching_survey_responses').select('survey_id').in('survey_id', rows.map(r => r.id))
        for (const r of (resp ?? []) as Array<{ survey_id: string }>) counts.set(r.survey_id, (counts.get(r.survey_id) ?? 0) + 1)
      }
      // Названия подразделений — для отображения в списке.
      const deptIds = [...new Set(rows.map(r => r.department_id).filter(Boolean) as string[])]
      const deptById = new Map<string, { id: string; name: string; name_he: string | null; name_en: string | null }>()
      if (deptIds.length) {
        const { data: depts } = await sb.from('departments').select('id, name, name_he, name_en').in('id', deptIds)
        for (const d of (depts ?? []) as Array<{ id: string; name: string; name_he: string | null; name_en: string | null }>) deptById.set(d.id, d)
      }
      return NextResponse.json({ items: rows.map(r => ({
        ...r,
        responses: counts.get(r.id) ?? 0,
        department: r.department_id ? deptById.get(r.department_id) ?? null : null,
      })) })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ items: [] })
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireManager()
    if (gate.error) return gate.error
    const session = gate.session!
    const body = await request.json().catch(() => ({})) as { title?: string; department_id?: string }
    const title = (body.title ?? '').trim()
    if (!title) return apiError('invalid_reference', 400)

    // Определяем подразделение сбора и право на него.
    // superadmin/scope='all' — обязаны выбрать конкретное подразделение (сбор
    // всегда «по мехлаке»). scope='department' — своё; при одном подразделении
    // берём его автоматически, при нескольких требуем выбор.
    const scopeAll = session.roles.includes('superadmin')
      || (await getEducationPrivilegeScope(session, 'manage_students')) === 'all'
    let deptId = (body.department_id ?? '').trim() || null
    if (!scopeAll) {
      const myDepts = await getUserDepartmentIds(session.person_id)
      if (deptId) {
        if (!myDepts.includes(deptId)) return apiError('forbidden', 403)
      } else if (myDepts.length === 1) {
        deptId = myDepts[0]
      } else {
        return apiError('department_id_required', 400)
      }
    } else {
      if (!deptId) return apiError('department_id_required', 400)
      const ok = await hasEducationPrivilege(session, 'manage_students', { department_id: deptId })
      if (!ok) return apiError('forbidden', 403)
    }

    const sb = createServerClient()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let ins = await (u(sb).from('teaching_surveys')
        .insert({ title, is_open: false, created_by: session.person_id, department_id: deptId } as any)
        .select('id, title, is_open, created_at, department_id').single() as any)
      if (ins.error && ins.error.code === '42703') {
        // Колонки ещё нет (деплой до миграции) — создаём legacy-сбор без неё.
        ins = await u(sb).from('teaching_surveys')
          .insert({ title, is_open: false, created_by: session.person_id })
          .select('id, title, is_open, created_at').single()
      }
      if (ins.error) throw ins.error
      return NextResponse.json({ survey: ins.data }, { status: 201 })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_unavailable', 503)
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
