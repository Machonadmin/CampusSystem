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

type Dept = { id: string; name: string; parent_id: string | null; head_person_id?: string | null; structure_tier?: string | null; sort_order?: number | null }

/**
 * Читает departments с sort_order и structure_tier; каскадный fallback, если
 * какой-то из необязательных столбцов ещё не добавлен миграцией:
 *   full (оба) → только sort_order → базовые. head_person_id есть всегда.
 */
async function readDepts(sb: ReturnType<typeof createServerClient>): Promise<Dept[]> {
  const full = await sb.from('departments').select('id, name, parent_id, head_person_id, sort_order, structure_tier')
  if (!full.error) return (full.data ?? []) as Dept[]
  const midd = await sb.from('departments').select('id, name, parent_id, head_person_id, sort_order')
  if (!midd.error) return (midd.data ?? []) as Dept[]
  const base = await sb.from('departments').select('id, name, parent_id, head_person_id')
  if (base.error) throw base.error
  return (base.data ?? []) as Dept[]
}

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
    const all = await readDepts(sb)
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

    // Имена руководителей (head_person_id) узлов поддерева — для показа «кто ведёт».
    const headIds = [...new Set([...ids].map(id => byId.get(id)?.head_person_id).filter(Boolean))] as string[]
    const headNameById = new Map<string, string>()
    if (headIds.length > 0) {
      const { data: persons } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', headIds)
      for (const p of (persons ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) {
        headNameById.set(p.id, p.hebrew_name || p.full_name || '')
      }
    }

    const nodes = [...ids].map(id => {
      const d = byId.get(id)!
      const gs = (groupsByNode.get(id) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'he'))
      return {
        id: d.id,
        name: d.name,
        tier: d.structure_tier ?? null,
        sort_order: d.sort_order ?? 0,
        head: d.head_person_id ? (headNameById.get(d.head_person_id) || null) : null,
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

    const body = await request.json().catch(() => ({})) as { parent_id?: string; name?: string; tier?: string | null }
    const name = (body.name ?? '').trim()
    const parentId = (body.parent_id ?? '').trim() || params.unitId
    const tier = (body.tier ?? '').trim() || null
    if (!name) return apiError('title_required', 400)

    const sb = createServerClient()
    const all = await readDepts(sb)
    const ids = subtreeIds(all, params.unitId)
    if (!ids.has(parentId)) return apiError('forbidden', 403) // parent вне поддерева единицы

    // Deploy-safe insert: пробуем с sort_order + structure_tier, при ошибке
    // (колонок ещё нет) — падаем к базовым колонкам.
    const full = await sb.from('departments')
      .insert({ name, parent_id: parentId, head_person_id: null, sort_order: 0, structure_tier: tier } as never)
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
