import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { getCookieLocale } from '@/lib/i18n/locale'
import { createServerClient } from '@/lib/supabase/server'
import { requireDataSecurityPrivilege } from '@/lib/data-security/permissions'
import { loadTree } from '@/lib/data-security/load'

/**
 * Дерево отображения прав.
 *
 *   GET   — дерево на языке пользователя плюс нераспределённые права.
 *   PATCH — перетаскивание: перенос узла и/или перенос права в другой узел.
 *
 * PATCH меняет ТОЛЬКО security_tree_nodes / security_tree_items. Ни
 * role_privileges, ни person_privileges он не трогает — поэтому перестройка
 * дерева физически не может никому ничего открыть или закрыть. Это же
 * закреплено тестом-стражем lib/data-security/tree-isolation.test.ts.
 */

export async function GET() {
  try {
    await requireDataSecurityPrivilege('access')
    return NextResponse.json(await loadTree(getCookieLocale()))
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

interface MoveNode { kind: 'node'; id: string; parent_id: string | null; sort_order: number }
interface MoveItem { kind: 'item'; module: string; privilege_code: string; node_id: string; sort_order: number }
type Move = MoveNode | MoveItem

export async function PATCH(request: NextRequest) {
  try {
    // Перестройка дерева — отдельное право от выдачи: она безопасна, потому что
    // меняет только показ, и держать её вместе с 'grant' было бы неверно.
    await requireDataSecurityPrivilege('manage_tree')
    const sb = createServerClient()

    const { moves } = await request.json() as { moves?: Move[] }
    if (!Array.isArray(moves) || moves.length === 0) {
      return apiError('invalid_reference', 400)
    }

    for (const move of moves) {
      if (move.kind === 'node') {
        if (!move.id) return apiError('invalid_reference', 400)
        // Петлю ловит триггер security_tree_no_cycle на уровне БД: проверять её
        // здесь пришлось бы отдельным обходом, а БД делает это надёжнее.
        const { error } = await sb
          .from('security_tree_nodes')
          .update({ parent_id: move.parent_id ?? null, sort_order: move.sort_order ?? 0 })
          .eq('id', move.id)
        if (error) throw error
      } else if (move.kind === 'item') {
        if (!move.module || !move.privilege_code || !move.node_id) return apiError('invalid_reference', 400)
        // upsert, а не update: право могло быть ещё не разложено (лежать в
        // «не распределено») — тогда строки пункта просто нет.
        const { error } = await sb
          .from('security_tree_items')
          .upsert({
            node_id: move.node_id,
            module: move.module,
            privilege_code: move.privilege_code,
            sort_order: move.sort_order ?? 0,
          }, { onConflict: 'module,privilege_code' })
        if (error) throw error
      } else {
        return apiError('invalid_reference', 400)
      }
    }

    return NextResponse.json(await loadTree(getCookieLocale()))
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    // Триггер петли отдаёт P0001 с понятным текстом — отдаём его как есть.
    const status = e.status ?? (e.code === 'P0001' ? 409 : 500)
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status })
  }
}
