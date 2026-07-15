import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageUnit } from '@/lib/education/unit-access'

/**
 * Внутренняя структура учебной единицы = поддерево вложенных под-единиц
 * (departments.parent_id). Владелец строит дерево (רמה/שיעור/כיתה или любое),
 * называя ярусы как хочет; учебные группы (class_groups) крепятся к листьям.
 * Новых таблиц НЕТ — используем самоссылочный departments.
 *
 * GET  — узлы поддерева единицы + прикреплённые к каждому активные учебные группы.
 * POST — создать под-единицу { parent_id, name } (parent — сама единица или узел
 *        её поддерева).
 *
 * Право: superadmin или глава корневой единицы (canManageUnit).
 */

type Dept = { id: string; name: string; parent_id: string | null }

/** Собирает id всех узлов поддерева с корнем rootId (включая корень). */
function subtreeIds(all: Dept[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const d of all) {
    if (!d.parent_id) continue
    const arr = childrenOf.get(d.parent_id) ?? []; arr.push(d.id); childrenOf.set(d.parent_id, arr)
  }
  const ids = new Set<string>([rootId])
  const stack = [rootId]
  while (stack.length) {
    const cur = stack.pop()!
    for (const ch of childrenOf.get(cur) ?? []) {
      if (!ids.has(ch)) { ids.add(ch); stack.push(ch) }
    }
  }
  return ids
}

export async function GET(_req: NextRequest, { params }: { params: { unitId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageUnit(session, params.unitId))) return apiError('forbidden', 403)

    const sb = createServerClient()
    const { data: deptsRaw, error } = await sb.from('departments').select('id, name, parent_id')
    if (error) throw error
    const all = (deptsRaw ?? []) as Dept[]
    const byId = new Map(all.map(d => [d.id, d]))
    if (!byId.has(params.unitId)) return apiError('not_found', 404)

    const ids = subtreeIds(all, params.unitId)

    // Активные учебные группы, прикреплённые к узлам поддерева.
    const groupsByNode = new Map<string, Array<{ id: string; name: string }>>()
    const { data: groups } = await sb
      .from('class_groups')
      .select('id, name, department_id, is_active')
      .in('department_id', [...ids])
    for (const g of (groups ?? []) as Array<{ id: string; name: string; department_id: string; is_active: boolean }>) {
      if (!g.is_active) continue
      const arr = groupsByNode.get(g.department_id) ?? []; arr.push({ id: g.id, name: g.name }); groupsByNode.set(g.department_id, arr)
    }

    const nodes = [...ids].map(id => {
      const d = byId.get(id)!
      const gs = (groupsByNode.get(id) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'he'))
      return {
        id: d.id,
        name: d.name,
        parent_id: d.id === params.unitId ? null : d.parent_id, // корень отдаём как top
        is_root: d.id === params.unitId,
        groups: gs,
      }
    })

    return NextResponse.json({ unit_id: params.unitId, nodes })
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

    const body = await request.json().catch(() => ({})) as { parent_id?: string; name?: string }
    const name = (body.name ?? '').trim()
    const parentId = (body.parent_id ?? '').trim() || params.unitId
    if (!name) return apiError('title_required', 400)

    const sb = createServerClient()
    const { data: deptsRaw, error } = await sb.from('departments').select('id, name, parent_id')
    if (error) throw error
    const all = (deptsRaw ?? []) as Dept[]
    const ids = subtreeIds(all, params.unitId)
    if (!ids.has(parentId)) return apiError('forbidden', 403) // parent вне поддерева единицы

    // Deploy-safe insert: пытаемся с sort_order, иначе базовыми колонками.
    const full = await sb.from('departments')
      .insert({ name, parent_id: parentId, head_person_id: null, sort_order: 0 } as never)
      .select('id, name, parent_id').single()
    let data = full.data
    if (full.error) {
      const base = await sb.from('departments')
        .insert({ name, parent_id: parentId, head_person_id: null } as never)
        .select('id, name, parent_id').single()
      if (base.error) throw base.error
      data = base.data
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
