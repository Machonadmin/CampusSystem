import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny, getUserDepartmentIds } from '@/lib/education/permissions'
import { u, notifyDepartmentAbsence } from '@/lib/education/absence-cases'

/**
 * טיפול בהעדרויות — случаи отсутствия.
 *   GET  → список (менеджер видит все; сотрудник — переданные его подразделению).
 *   POST → открыть случай { journey_id, lesson_id?, absence_date?, note?, department_id? }.
 * Доступ: manage_students / superadmin для открытия; чтение — ещё и по своим
 * подразделениям. Deploy-safe (42P01 → пусто/503).
 */
type CaseRow = {
  id: string; journey_id: string; lesson_id: string | null; absence_date: string | null
  note: string | null; status: string; assigned_department_id: string | null
  opened_by: string | null; opened_at: string; handled_by: string | null
  resolution: string | null; resolved_at: string | null
}

async function resolveNames(sb: ReturnType<typeof createServerClient>, rows: CaseRow[]) {
  const journeyIds = [...new Set(rows.map(r => r.journey_id))]
  const deptIds = [...new Set(rows.map(r => r.assigned_department_id).filter(Boolean))] as string[]
  const personIds = [...new Set([...rows.map(r => r.opened_by), ...rows.map(r => r.handled_by)].filter(Boolean))] as string[]

  const studentByJourney = new Map<string, string>()
  if (journeyIds.length) {
    const { data: js } = await sb.from('education_journeys').select('id, person_id').in('id', journeyIds)
    const personByJourney = new Map((js ?? []).map(j => [(j as { id: string }).id, (j as { person_id: string }).person_id]))
    const pids = [...new Set([...personByJourney.values(), ...personIds])]
    const nameById = new Map<string, string>()
    if (pids.length) {
      const { data: ps } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', pids)
      for (const p of (ps ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) nameById.set(p.id, (p.hebrew_name || p.full_name || '').trim())
    }
    for (const [jid, pid] of personByJourney) studentByJourney.set(jid, nameById.get(pid) ?? '')
    // also resolve opener/handler names via nameById
    const deptName = new Map<string, string>()
    if (deptIds.length) {
      const { data: ds } = await sb.from('departments').select('id, name').in('id', deptIds)
      for (const d of (ds ?? []) as Array<{ id: string; name: string }>) deptName.set(d.id, d.name)
    }
    return { studentByJourney, personName: nameById, deptName }
  }
  return { studentByJourney, personName: new Map<string, string>(), deptName: new Map<string, string>() }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)

    const isManager = session.roles.includes('superadmin') || await canDoEducationInAny(session, 'manage_students')
    const myDepts = isManager ? [] : await getUserDepartmentIds(session.person_id)
    if (!isManager && myDepts.length === 0) return NextResponse.json({ items: [] })

    const sb = createServerClient()
    const status = request.nextUrl.searchParams.get('status')?.trim()
    try {
      let q = u(sb).from('absence_cases').select('*').order('opened_at', { ascending: false })
      if (!isManager) q = q.in('assigned_department_id', myDepts)
      if (status && ['open', 'in_handling', 'resolved'].includes(status)) q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      const rows = (data ?? []) as CaseRow[]
      const { studentByJourney, personName, deptName } = await resolveNames(sb, rows)
      // Список подразделений для пикера передачи (доска уже гейтится выше).
      const { data: depts } = await sb.from('departments').select('id, name').order('name')
      const departments = (depts ?? []) as Array<{ id: string; name: string }>
      return NextResponse.json({
        departments,
        items: rows.map(r => ({
          ...r,
          student_name: studentByJourney.get(r.journey_id) ?? '',
          department_name: r.assigned_department_id ? (deptName.get(r.assigned_department_id) ?? null) : null,
          opened_by_name: r.opened_by ? (personName.get(r.opened_by) ?? null) : null,
          handled_by_name: r.handled_by ? (personName.get(r.handled_by) ?? null) : null,
        })),
        can_manage: isManager,
      })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ items: [], can_manage: isManager })
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)
    const ok = session.roles.includes('superadmin') || await canDoEducationInAny(session, 'manage_students')
    if (!ok) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { journey_id?: string; lesson_id?: string; absence_date?: string; note?: string; department_id?: string }
    const journeyId = (body.journey_id ?? '').trim()
    if (!journeyId) return apiError('invalid_reference', 400)
    const departmentId = (body.department_id ?? '').trim() || null

    const sb = createServerClient()
    try {
      const { data, error } = await u(sb).from('absence_cases').insert({
        journey_id: journeyId,
        lesson_id: (body.lesson_id ?? '').trim() || null,
        absence_date: (body.absence_date ?? '').trim() || null,
        note: (body.note ?? '').trim() || null,
        status: departmentId ? 'in_handling' : 'open',
        assigned_department_id: departmentId,
        opened_by: session.person_id,
      }).select('id').single()
      if (error) throw error

      if (departmentId) {
        const { data: j } = await sb.from('education_journeys').select('person_id').eq('id', journeyId).maybeSingle()
        let studentName = ''
        const pid = (j as { person_id?: string } | null)?.person_id
        if (pid) { const { data: p } = await sb.from('persons').select('full_name, hebrew_name').eq('id', pid).maybeSingle(); studentName = ((p as { full_name?: string | null; hebrew_name?: string | null } | null)?.full_name || (p as { hebrew_name?: string | null } | null)?.hebrew_name || '').trim() }
        try { await notifyDepartmentAbsence(sb, departmentId, studentName, (body.note ?? '').trim() || null) } catch { /* best-effort */ }
      }
      return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_unavailable', 503)
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
