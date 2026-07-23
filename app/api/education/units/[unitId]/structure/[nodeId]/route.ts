import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageUnit } from '@/lib/education/unit-access'

/**
 * Один узел структуры единицы (под-единица = department в её поддереве).
 *
 * PATCH  { name } — переименовать.
 * DELETE          — удалить под-единицу; запрещено, если есть дети или
 *                   прикреплённые учебные группы (сначала перенести/удалить их).
 *                   Сам корень единицы удалить нельзя.
 *
 * Право: superadmin или глава корневой единицы (canManageUnit); узел обязан
 * лежать в поддереве этой единицы.
 */

type Dept = { id: string; name: string; parent_id: string | null }

function subtreeIds(all: Dept[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const d of all) {
    if (!d.parent_id) continue
    const arr = childrenOf.get(d.parent_id) ?? []; arr.push(d.id); childrenOf.set(d.parent_id, arr)
  }
  const ids = new Set<string>([rootId]); const stack = [rootId]
  while (stack.length) {
    const cur = stack.pop()!
    for (const ch of childrenOf.get(cur) ?? []) if (!ids.has(ch)) { ids.add(ch); stack.push(ch) }
  }
  return ids
}

async function guard(unitId: string, nodeId: string) {
  const session = await getSession()
  if (!session) return { err: apiError('unauthorized', 401) }
  if (!(await canManageUnit(session, unitId))) return { err: apiError('forbidden', 403) }
  const sb = createServerClient()
  const { data: deptsRaw, error } = await sb.from('departments').select('id, name, parent_id')
  if (error) throw error
  const all = (deptsRaw ?? []) as Dept[]
  const ids = subtreeIds(all, unitId)
  if (!ids.has(nodeId)) return { err: apiError('not_found', 404) }
  if (nodeId === unitId) return { err: apiError('forbidden', 403) } // корень не трогаем через этот роут
  return { sb, all }
}

export async function PATCH(request: NextRequest, { params }: { params: { unitId: string; nodeId: string } }) {
  try {
    const g = await guard(params.unitId, params.nodeId)
    if (g.err) return g.err
    const body = await request.json().catch(() => ({})) as { name?: string; tier?: string | null }
    const name = (body.name ?? '').trim()
    if (!name) return apiError('title_required', 400)
    const tierProvided = Object.prototype.hasOwnProperty.call(body, 'tier')
    const tier = (body.tier ?? '').trim() || null

    // Пробуем обновить с structure_tier; если колонки ещё нет — только name.
    const full = await g.sb!.from('departments')
      .update((tierProvided ? { name, structure_tier: tier } : { name }) as never)
      .eq('id', params.nodeId)
    if (full.error) {
      const base = await g.sb!.from('departments').update({ name } as never).eq('id', params.nodeId)
      if (base.error) throw base.error
    }
    return NextResponse.json({ id: params.nodeId, name, tier })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { unitId: string; nodeId: string } }) {
  try {
    const g = await guard(params.unitId, params.nodeId)
    if (g.err) return g.err
    const sb = g.sb!

    // Нельзя удалить узел с детьми.
    const hasChild = (g.all ?? []).some(d => d.parent_id === params.nodeId)
    if (hasChild) return apiError('structure_has_children', 409)

    // Нельзя удалить узел с прикреплёнными учебными группами.
    const { data: groups } = await sb.from('class_groups').select('id').eq('department_id', params.nodeId).limit(1)
    if ((groups ?? []).length > 0) return apiError('structure_has_groups', 409)

    const { error } = await sb.from('departments').delete().eq('id', params.nodeId)
    if (error) throw error
    return NextResponse.json({ removed: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
