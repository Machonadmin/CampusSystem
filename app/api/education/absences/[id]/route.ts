import type { Database } from '@/types/database'
import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny, getUserDepartmentIds } from '@/lib/education/permissions'
import { notifyDepartmentAbsence } from '@/lib/education/absence-cases'

/**
 * PATCH /api/education/absences/[id]
 *   { department_id? } — передать случай другому подразделению (уведомляем его).
 *   { status: 'resolved', resolution? } — закрыть; { status: 'open'|'in_handling' } — вернуть.
 * Доступ: manage_students / superadmin ЛИБО сотрудник подразделения, которому
 * случай сейчас назначен (принимающая сторона может обработать/передать дальше).
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)

    const sb = createServerClient()
    try {
      const { data: row } = await sb.from('absence_cases').select('id, journey_id, assigned_department_id, note, status').eq('id', params.id).maybeSingle()
      if (!row) return apiError('substage_not_found', 404)
      const caseRow = row as { id: string; journey_id: string; assigned_department_id: string | null; note: string | null; status: string }

      const isManager = session.roles.includes('superadmin') || await canDoEducationInAny(session, 'manage_students')
      const myDepts = isManager ? [] : await getUserDepartmentIds(session.person_id)
      const canAct = isManager || (!!caseRow.assigned_department_id && myDepts.includes(caseRow.assigned_department_id))
      if (!canAct) return apiError('forbidden', 403)

      const body = await request.json().catch(() => ({})) as { department_id?: string; status?: string; resolution?: string }
      const patch: Database['public']['Tables']['absence_cases']['Update'] = { updated_at: new Date().toISOString() }
      let transferTo: string | null = null

      if (typeof body.department_id === 'string') {
        transferTo = body.department_id.trim() || null
        patch.assigned_department_id = transferTo
        if (caseRow.status === 'open' && transferTo) patch.status = 'in_handling'
      }
      if (typeof body.status === 'string' && ['open', 'in_handling', 'resolved'].includes(body.status)) {
        patch.status = body.status
        if (body.status === 'resolved') {
          patch.resolution = (body.resolution ?? '').trim() || null
          patch.handled_by = session.person_id
          patch.resolved_at = new Date().toISOString()
        } else {
          patch.resolved_at = null
        }
      }

      const { error } = await sb.from('absence_cases').update(patch).eq('id', params.id)
      if (error) throw error

      // Уведомление принимающему подразделению при передаче.
      if (transferTo) {
        const { data: j } = await sb.from('education_journeys').select('person_id').eq('id', caseRow.journey_id).maybeSingle()
        let studentName = ''
        const pid = (j as { person_id?: string } | null)?.person_id
        if (pid) { const { data: p } = await sb.from('persons').select('full_name, hebrew_name').eq('id', pid).maybeSingle(); studentName = ((p as { full_name?: string | null; hebrew_name?: string | null } | null)?.full_name || (p as { hebrew_name?: string | null } | null)?.hebrew_name || '').trim() }
        try { await notifyDepartmentAbsence(sb, transferTo, studentName, caseRow.note) } catch { /* best-effort */ }
      }
      return NextResponse.json({ ok: true })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_unavailable', 503)
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
