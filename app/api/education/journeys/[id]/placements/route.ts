import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { journeyDeptTarget } from '@/lib/education/journey-target'
import { getHeadedUnitIds } from '@/lib/education/unit-access'

/**
 * GET /api/education/journeys/[id]/placements — куда ученица зачислена,
 * сгруппировано по учебной единице (department = утро-קודש / после-полудня-חול).
 * Даёт наглядную «двухдоменную» картину размещения + список единиц, которыми
 * текущий пользователь вправе управлять (чтобы UI показал «добавить в класс»).
 *
 * Право: view_students по подразделению journey (или superadmin).
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()
    const isSuper = session.roles.includes('superadmin')
    const allowed = isSuper || await hasEducationPrivilege(session, 'view_students', await journeyDeptTarget(sb, params.id))
    if (!allowed) return apiError('forbidden', 403)

    // Зачисления journey → классы.
    const { data: enrolls } = await sb
      .from('class_enrollments')
      .select('class_group_id, enrolled_at')
      .eq('journey_id', params.id)
    const groupIds = [...new Set((enrolls ?? []).map(e => (e as { class_group_id: string }).class_group_id))]

    const enrolledAt = new Map<string, string | null>()
    for (const e of (enrolls ?? []) as Array<{ class_group_id: string; enrolled_at: string | null }>) {
      enrolledAt.set(e.class_group_id, e.enrolled_at)
    }

    interface UnitGroup {
      unit_id: string | null
      unit_name: string
      classes: Array<{ id: string; name: string; subject: string | null; enrolled_at: string | null }>
    }
    const byUnit = new Map<string, UnitGroup>()

    if (groupIds.length > 0) {
      const { data: groups } = await sb
        .from('class_groups')
        .select('id, name, department_id, subject:subjects(name), department:departments(id, name)')
        .in('id', groupIds)
      for (const g of (groups ?? []) as unknown as Array<{ id: string; name: string; department_id: string | null; subject: { name: string } | null; department: { id: string; name: string } | null }>) {
        const uid = g.department?.id ?? g.department_id ?? 'none'
        let entry = byUnit.get(uid)
        if (!entry) {
          entry = { unit_id: g.department?.id ?? g.department_id ?? null, unit_name: g.department?.name ?? '—', classes: [] }
          byUnit.set(uid, entry)
        }
        entry.classes.push({ id: g.id, name: g.name, subject: g.subject?.name ?? null, enrolled_at: enrolledAt.get(g.id) ?? null })
      }
    }

    const units = [...byUnit.values()].sort((a, b) => a.unit_name.localeCompare(b.unit_name, 'he'))

    // Единицы, которыми пользователь управляет — для действия «добавить в класс».
    const managedUnitIds = isSuper ? null : await getHeadedUnitIds(session.person_id)

    return NextResponse.json({ units, managed_unit_ids: managedUnitIds, is_super: isSuper })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
