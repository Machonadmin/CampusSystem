import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { getCookieLocale } from '@/lib/i18n/locale'
import { createServerClient } from '@/lib/supabase/server'
import { requireDataSecurityPrivilege } from '@/lib/data-security/permissions'
import { loadTree } from '@/lib/data-security/load'
import { errorResponse } from '@/lib/api/handler'

/**
 * Узел дерева отображения.
 *
 *   POST   — создать («новая тема» или «вынести в отдельный модуль»).
 *   PATCH  — переименовать, сменить цвет/иконку, привязать к подразделению.
 *   DELETE — удалить; права из него НЕ пропадают, они уходят в
 *            «не распределено» (см. ниже).
 *
 * Как и в tree/route.ts, ни одна операция не касается role_privileges /
 * person_privileges: это структура показа.
 */

interface NodeBody {
  id?: string
  parent_id?: string | null
  sort_order?: number
  name_he?: string
  name_ru?: string | null
  name_en?: string | null
  description_he?: string | null
  description_ru?: string | null
  description_en?: string | null
  icon?: string | null
  color?: string | null
  department_id?: string | null
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireDataSecurityPrivilege('manage_tree')
    // Автор изменения уходит в журнал изменений (см. createServerClient).
    const sb = createServerClient({ actorPersonId: session.person_id })
    const body = await request.json() as NodeBody

    // Имя на иврите обязательно: без него экран показал бы пустую строку или
    // технический идентификатор, а технического текста на экране быть не должно.
    const nameHe = body.name_he?.trim()
    if (!nameHe) return apiError('required_fields', 400)

    const { error } = await sb.from('security_tree_nodes').insert({
      parent_id: body.parent_id ?? null,
      sort_order: body.sort_order ?? 0,
      name_he: nameHe,
      name_ru: body.name_ru?.trim() || null,
      name_en: body.name_en?.trim() || null,
      description_he: body.description_he?.trim() || null,
      description_ru: body.description_ru?.trim() || null,
      description_en: body.description_en?.trim() || null,
      module_code: null,   // узел, созданный человеком, модулю не соответствует
      icon: body.icon ?? null,
      color: body.color ?? null,
      department_id: body.department_id ?? null,
    })
    if (error) throw error

    return NextResponse.json(await loadTree(getCookieLocale()))
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireDataSecurityPrivilege('manage_tree')
    // Автор изменения уходит в журнал изменений (см. createServerClient).
    const sb = createServerClient({ actorPersonId: session.person_id })
    const body = await request.json() as NodeBody
    if (!body.id) return apiError('invalid_reference', 400)

    // Собираем только переданные поля: PATCH не должен обнулять подписи,
    // которых не было в запросе.
    const patch: Record<string, unknown> = {}
    if (body.name_he !== undefined) {
      const v = body.name_he.trim()
      if (!v) return apiError('required_fields', 400)
      patch.name_he = v
    }
    if (body.name_ru !== undefined) patch.name_ru = body.name_ru?.trim() || null
    if (body.name_en !== undefined) patch.name_en = body.name_en?.trim() || null
    if (body.description_he !== undefined) patch.description_he = body.description_he?.trim() || null
    if (body.description_ru !== undefined) patch.description_ru = body.description_ru?.trim() || null
    if (body.description_en !== undefined) patch.description_en = body.description_en?.trim() || null
    if (body.icon !== undefined) patch.icon = body.icon
    if (body.color !== undefined) patch.color = body.color
    if (body.department_id !== undefined) patch.department_id = body.department_id
    if (body.parent_id !== undefined) patch.parent_id = body.parent_id
    if (body.sort_order !== undefined) patch.sort_order = body.sort_order

    if (Object.keys(patch).length === 0) return apiError('invalid_reference', 400)

    const { error } = await sb.from('security_tree_nodes').update(patch).eq('id', body.id)
    if (error) throw error

    return NextResponse.json(await loadTree(getCookieLocale()))
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    const status = e.status ?? (e.code === 'P0001' ? 409 : 500)
    return errorResponse({ message: e.message, status })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireDataSecurityPrivilege('manage_tree')
    // Автор изменения уходит в журнал изменений (см. createServerClient).
    const sb = createServerClient({ actorPersonId: session.person_id })
    const id = request.nextUrl.searchParams.get('id')
    if (!id) return apiError('invalid_reference', 400)

    // Корни, соответствующие модулям, удалять нельзя: модуль есть в коде, и
    // без своего корня все его права оказались бы в «не распределено» — экран
    // стал бы менее понятным, а не более.
    const { data: node } = await sb
      .from('security_tree_nodes')
      .select('module_code')
      .eq('id', id)
      .maybeSingle()
    if (node?.module_code) return apiError('forbidden', 403)

    // Права из удаляемого узла НЕ исчезают: ON DELETE CASCADE убирает только
    // строки раскладки, а сами права остаются в каталоге и показываются в
    // «не распределено». Потерять право здесь нельзя.
    const { error } = await sb.from('security_tree_nodes').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json(await loadTree(getCookieLocale()))
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
