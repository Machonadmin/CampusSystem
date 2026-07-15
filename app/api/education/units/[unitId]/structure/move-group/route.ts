import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageUnit } from '@/lib/education/unit-access'

/**
 * POST /api/education/units/[unitId]/structure/move-group
 *   { group_id, target_node_id }
 *
 * Прикрепляет учебную группу к другому узлу структуры единицы (меняет
 * class_groups.department_id). И группа (её текущий узел), и целевой узел
 * обязаны лежать в поддереве единицы — так группу нельзя «увести» из единицы.
 *
 * Право: superadmin или глава корневой единицы (canManageUnit).
 */

type Dept = { id: string; parent_id: string | null }

function subtreeIds(all: Dept[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const d of all) { if (!d.parent_id) continue; const a = childrenOf.get(d.parent_id) ?? []; a.push(d.id); childrenOf.set(d.parent_id, a) }
  const ids = new Set<string>([rootId]); const stack = [rootId]
  while (stack.length) { const c = stack.pop()!; for (const ch of childrenOf.get(c) ?? []) if (!ids.has(ch)) { ids.add(ch); stack.push(ch) } }
  return ids
}

export async function POST(request: NextRequest, { params }: { params: { unitId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageUnit(session, params.unitId))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { group_id?: string; target_node_id?: string }
    const groupId = (body.group_id ?? '').trim()
    const targetNodeId = (body.target_node_id ?? '').trim()
    if (!groupId || !targetNodeId) return apiError('invalid_field_value_status', 400)

    const sb = createServerClient()
    const { data: deptsRaw, error: dErr } = await sb.from('departments').select('id, parent_id')
    if (dErr) throw dErr
    const ids = subtreeIds((deptsRaw ?? []) as Dept[], params.unitId)
    if (!ids.has(targetNodeId)) return apiError('forbidden', 403) // цель вне поддерева

    // Группа существует и её текущий узел — в поддереве единицы.
    const { data: grp, error: gErr } = await sb
      .from('class_groups').select('id, department_id').eq('id', groupId).maybeSingle()
    if (gErr) throw gErr
    if (!grp) return apiError('group_not_found', 404)
    const cur = (grp as { department_id: string | null }).department_id
    if (!cur || !ids.has(cur)) return apiError('forbidden', 403) // группа не из этой единицы

    const { error: uErr } = await sb.from('class_groups')
      .update({ department_id: targetNodeId } as never).eq('id', groupId)
    if (uErr) throw uErr

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
