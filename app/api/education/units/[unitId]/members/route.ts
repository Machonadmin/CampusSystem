import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageUnit, GRANTABLE_EDUCATION_PRIVILEGES } from '@/lib/education/unit-access'

/**
 * Состав учебной единицы: секретари и учителя под руководителем.
 *
 * GET  — список активных членов единицы + их роли + (education) персональные
 *        права, чтобы показать тумблеры.
 * POST — добавить человека секретарём/учителем: создать нового ИЛИ прикрепить
 *        существующего. Создаёт staff_position в единице + назначает роль.
 *
 * Право: superadmin или глава этой единицы (canManageUnit).
 */

const MEMBER_ROLES = ['studies_secretary', 'teacher'] as const
type MemberRole = (typeof MEMBER_ROLES)[number]

export async function GET(_req: NextRequest, { params }: { params: { unitId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageUnit(session, params.unitId))) return apiError('forbidden', 403)

    const sb = createServerClient()

    // Активные позиции в единице.
    const today = new Date().toISOString().slice(0, 10)
    const { data: positions } = await sb
      .from('staff_positions')
      .select('id, person_id, position_he, position_ru, is_head, end_date')
      .eq('department_id', params.unitId)
    const active = (positions ?? []).filter(p => {
      const ed = (p as { end_date: string | null }).end_date
      return ed === null || ed > today
    }) as Array<{ id: string; person_id: string; position_he: string | null; position_ru: string | null; is_head: boolean }>

    const personIds = [...new Set(active.map(p => p.person_id))]
    if (personIds.length === 0) return NextResponse.json({ members: [] })

    const [{ data: persons }, { data: roleRows }, { data: pgrants }] = await Promise.all([
      sb.from('persons').select('id, full_name, hebrew_name, email').in('id', personIds),
      sb.from('person_roles').select('person_id, roles(code)').in('person_id', personIds),
      sb.from('person_privileges').select('person_id, privilege_code, is_granted, expires_at').eq('module', 'education').in('person_id', personIds),
    ])

    // Постоянное доп. время учителей (teacher_attendance_grants, lesson_id NULL).
    // Deploy-safe: таблицы может ещё не быть.
    const extraByPerson = new Map<string, number>()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: grants } = await (sb as any)
        .from('teacher_attendance_grants').select('teacher_id, extra_minutes, lesson_id').in('teacher_id', personIds)
      for (const g of (grants ?? []) as Array<{ teacher_id: string; extra_minutes: number; lesson_id: string | null }>) {
        if (g.lesson_id === null) extraByPerson.set(g.teacher_id, Math.max(extraByPerson.get(g.teacher_id) ?? 0, g.extra_minutes ?? 0))
      }
    } catch { /* нет таблицы — без доп. времени */ }

    const nameById = new Map<string, { full_name: string | null; hebrew_name: string | null; email: string | null }>()
    for (const p of (persons ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null; email: string | null }>) {
      nameById.set(p.id, { full_name: p.full_name, hebrew_name: p.hebrew_name, email: p.email })
    }
    const rolesByPerson = new Map<string, string[]>()
    for (const r of (roleRows ?? []) as unknown as Array<{ person_id: string; roles: { code: string } | null }>) {
      const arr = rolesByPerson.get(r.person_id) ?? []
      if (r.roles?.code) arr.push(r.roles.code)
      rolesByPerson.set(r.person_id, arr)
    }
    const grantsByPerson = new Map<string, Record<string, boolean>>()
    const nowIso = new Date().toISOString()
    for (const g of (pgrants ?? []) as Array<{ person_id: string; privilege_code: string; is_granted: boolean; expires_at: string | null }>) {
      if (g.expires_at && g.expires_at <= nowIso) continue
      const m = grantsByPerson.get(g.person_id) ?? {}
      m[g.privilege_code] = !!g.is_granted
      grantsByPerson.set(g.person_id, m)
    }

    const members = active.map(pos => {
      const roles = rolesByPerson.get(pos.person_id) ?? []
      const kind: MemberRole = roles.includes('teacher') && !roles.includes('studies_secretary') ? 'teacher' : 'studies_secretary'
      const person = nameById.get(pos.person_id)
      return {
        position_id: pos.id,
        person_id: pos.person_id,
        full_name: person?.full_name ?? '',
        hebrew_name: person?.hebrew_name ?? null,
        email: person?.email ?? null,
        is_head: pos.is_head,
        role: kind,
        roles,
        extra_minutes: extraByPerson.get(pos.person_id) ?? 0,
        // текущие персональные права (только грантуемые)
        privileges: GRANTABLE_EDUCATION_PRIVILEGES.reduce<Record<string, boolean>>((acc, code) => {
          const g = grantsByPerson.get(pos.person_id)?.[code]
          if (g !== undefined) acc[code] = g
          return acc
        }, {}),
      }
    })
    // Секретари/учителя вперёд, главы в конце.
    members.sort((a, b) => Number(a.is_head) - Number(b.is_head))
    return NextResponse.json({ members })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { unitId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageUnit(session, params.unitId))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as {
      mode?: 'create' | 'existing'
      person_id?: string
      first_name?: string
      last_name?: string
      email?: string
      role?: MemberRole
    }
    const role: MemberRole = body.role === 'teacher' ? 'teacher' : 'studies_secretary'

    const sb = createServerClient()

    // 1. person_id — существующий или новый.
    let personId = body.person_id?.trim() || ''
    if (body.mode === 'create' || !personId) {
      const first = (body.first_name ?? '').trim()
      if (!first) return apiError('name_required', 400)
      const { data: person, error: pe } = await sb.from('persons').insert({
        last_name: (body.last_name ?? '').trim() || null,
        first_name: first,
        hebrew_name: null, gender: null, birth_date: null,
        photo_url: null, email: (body.email ?? '').trim() || null, phones: [], address: {}, notes: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).select('id').single()
      if (pe) throw pe
      personId = (person as { id: string }).id
    }

    // 2. Позиция в единице (если ещё нет активной).
    const posLabel = role === 'teacher' ? { he: 'מורה', ru: 'Преподаватель' } : { he: 'מזכירות לימודים', ru: 'Секретарь' }
    const { data: existingPos } = await sb.from('staff_positions')
      .select('id').eq('person_id', personId).eq('department_id', params.unitId).is('end_date', null).maybeSingle()
    if (!existingPos) {
      const { error: posErr } = await sb.from('staff_positions').insert({
        person_id: personId, department_id: params.unitId,
        position_ru: posLabel.ru, position_he: posLabel.he, position_id: null,
        is_head: false, start_date: new Date().toISOString().slice(0, 10), end_date: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      if (posErr) throw posErr
    }

    // 3. Роль (если ещё нет).
    const { data: roleRow } = await sb.from('roles').select('id').eq('code', role as never).maybeSingle()
    if (roleRow) {
      const roleId = (roleRow as { id: string }).id
      const { data: hasRole } = await sb.from('person_roles')
        .select('person_id').eq('person_id', personId).eq('role_id', roleId).maybeSingle()
      if (!hasRole) {
        const { error: prErr } = await sb.from('person_roles').insert({ person_id: personId, role_id: roleId, assigned_by: session.person_id })
        if (prErr && (prErr as { code?: string }).code !== '23505') throw prErr
      }
    }

    return NextResponse.json({ ok: true, person_id: personId }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
