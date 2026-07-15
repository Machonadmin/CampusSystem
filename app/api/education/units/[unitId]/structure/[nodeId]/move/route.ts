import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageUnit } from '@/lib/education/unit-access'

/**
 * POST /api/education/units/[unitId]/structure/[nodeId]/move  { direction: 'up'|'down' }
 *
 * Переставляет узел среди СИБЛИНГОВ (тот же parent) на одну позицию вверх/вниз.
 * Порядок хранится в departments.sort_order. После перестановки нормализуем
 * sort_order всех сиблингов = их индексу (устойчиво к нулевым значениям).
 *
 * Право: superadmin или глава корневой единицы; узел — в её поддереве, не корень.
 * Деплой-безопасно к отсутствию sort_order (503 feature_unavailable).
 */

type Dept = { id: string; name: string; parent_id: string | null; sort_order?: number | null }

function subtreeIds(all: Dept[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const d of all) { if (!d.parent_id) continue; const a = childrenOf.get(d.parent_id) ?? []; a.push(d.id); childrenOf.set(d.parent_id, a) }
  const ids = new Set<string>([rootId]); const stack = [rootId]
  while (stack.length) { const c = stack.pop()!; for (const ch of childrenOf.get(c) ?? []) if (!ids.has(ch)) { ids.add(ch); stack.push(ch) } }
  return ids
}

export async function POST(request: NextRequest, { params }: { params: { unitId: string; nodeId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageUnit(session, params.unitId))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { direction?: string }
    const dir = body.direction === 'up' ? 'up' : body.direction === 'down' ? 'down' : null
    if (!dir) return apiError('invalid_field_value_status', 400)

    const sb = createServerClient()
    // Читаем с sort_order; если колонки нет — фича недоступна.
    const res = await sb.from('departments').select('id, name, parent_id, sort_order')
    if (res.error) return apiError('feature_unavailable', 503)
    const all = (res.data ?? []) as Dept[]

    const ids = subtreeIds(all, params.unitId)
    if (!ids.has(params.nodeId) || params.nodeId === params.unitId) return apiError('not_found', 404)

    const node = all.find(d => d.id === params.nodeId)!
    const siblings = all
      .filter(d => d.parent_id === node.parent_id && ids.has(d.id) && d.id !== params.unitId)
      .sort((a, b) => {
        const sa = a.sort_order ?? 1e9, sbb = b.sort_order ?? 1e9
        if (sa !== sbb) return sa - sbb
        return a.name.localeCompare(b.name, 'he')
      })

    const i = siblings.findIndex(d => d.id === params.nodeId)
    const j = dir === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= siblings.length) return NextResponse.json({ ok: true, moved: false }) // край — no-op

    const ordered = siblings.slice()
    ;[ordered[i], ordered[j]] = [ordered[j], ordered[i]]

    // Нормализуем sort_order = индексу для всех сиблингов.
    for (let k = 0; k < ordered.length; k++) {
      if ((ordered[k].sort_order ?? -1) === k) continue
      const { error } = await sb.from('departments').update({ sort_order: k } as never).eq('id', ordered[k].id)
      if (error) throw error
    }

    return NextResponse.json({ ok: true, moved: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
