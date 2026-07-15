import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageUnit, isGrantablePrivilege } from '@/lib/education/unit-access'

/**
 * PUT /api/education/units/[unitId]/members/[personId]/privileges
 * Руководитель задаёт персональные тумблеры члена своей единицы.
 *   body: { privileges: { [code]: boolean } }
 *   true  → выдать (person_privileges is_granted=true, действует в scope=department)
 *   false → убрать (удаляем строку — откат к базовому праву роли)
 *
 * Право: superadmin или глава единицы; цель обязана быть активным членом единицы.
 */
export async function PUT(request: NextRequest, { params }: { params: { unitId: string; personId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageUnit(session, params.unitId))) return apiError('forbidden', 403)

    const sb = createServerClient()

    // Цель — активный член именно этой единицы.
    const today = new Date().toISOString().slice(0, 10)
    const { data: pos } = await sb.from('staff_positions')
      .select('id, end_date').eq('person_id', params.personId).eq('department_id', params.unitId)
    const isMember = (pos ?? []).some(p => {
      const ed = (p as { end_date: string | null }).end_date
      return ed === null || ed > today
    })
    if (!isMember) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { privileges?: Record<string, boolean> }
    const privileges = body.privileges ?? {}

    const toGrant: string[] = []
    const toRevoke: string[] = []
    for (const [code, on] of Object.entries(privileges)) {
      if (!isGrantablePrivilege(code)) continue
      if (on) toGrant.push(code); else toRevoke.push(code)
    }

    if (toGrant.length > 0) {
      const rows = toGrant.map(code => ({
        person_id: params.personId, module: 'education', privilege_code: code,
        is_granted: true, granted_by: session.person_id,
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await sb.from('person_privileges').upsert(rows as any, { onConflict: 'person_id,module,privilege_code' })
      if (error) throw error
    }
    if (toRevoke.length > 0) {
      const { error } = await sb.from('person_privileges')
        .delete().eq('person_id', params.personId).eq('module', 'education').in('privilege_code', toRevoke)
      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
