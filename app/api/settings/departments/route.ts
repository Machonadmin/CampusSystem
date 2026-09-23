import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/api/handler'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { isMissingRelation } from '@/lib/supabase/errors'


async function requireSuperadmin() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error(serverT('forbidden')), { status: 403 })
}

export async function GET() {
  try {
    await requireStaff()
    const sb = createServerClient()

    // Try query with sort_order (post-migration). If the column doesn't exist yet,
    // PostgREST returns an error and data=null — fall back to the base columns.
    const { data: deptsWithSort, error: sortErr } = await sb
      .from('departments')
      .select('id, name, name_he, name_en, parent_id, sort_order, description, is_educational_institution, created_at')
      .order('sort_order')
      .order('name')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let depts: any[] | null = deptsWithSort
    if (sortErr) {
      // Логируем ПЕРВУЮ ошибку: без этого откат к базовым колонкам молча прячет
      // и настоящую поломку (права, недоступная БД), и на экране остаётся
      // «ошибка загрузки» без единой зацепки.
      console.error('[departments] full select failed, falling back:', sortErr)
      const { data: fallback, error: fallbackErr } = await sb
        .from('departments')
        .select('id, name, parent_id, created_at')
        .order('name')
      if (fallbackErr) {
        console.error('[departments] base select failed too:', fallbackErr)
        // Таблицы/колонки ещё нет — это ожидаемое состояние между деплоем и
        // ручным прогоном миграции: отдаём понятный 503, а не голый 500.
        if (isMissingRelation(fallbackErr)) return apiError('feature_not_migrated', 503)
        throw fallbackErr
      }
      depts = fallback
    }

    // Активные позиции: и счётчик сотрудников, и глава единицы. Глава берётся
    // из staff_positions.is_head — того же поля, которым пользуется авторизация.
    // Раньше имя главы читалось из departments.head_person_id, второго поля
    // «глава», которое никто не синхронизировал с первым.
    const { data: staffPos } = await sb
      .from('staff_positions')
      .select('department_id, person_id, is_head')
      .is('end_date', null)

    const headPersonByDept = new Map<string, string>()
    const countByDept: Record<string, number> = {}
    for (const sp of (staffPos ?? []) as Array<{ department_id: string; person_id: string; is_head: boolean }>) {
      countByDept[sp.department_id] = (countByDept[sp.department_id] ?? 0) + 1
      if (sp.is_head && !headPersonByDept.has(sp.department_id)) {
        headPersonByDept.set(sp.department_id, sp.person_id)
      }
    }

    const headIds = [...new Set(headPersonByDept.values())]
    const { data: headPersons } = headIds.length
      ? await sb.from('persons').select('id, full_name').in('id', headIds)
      : { data: [] as { id: string; full_name: string }[] }

    const result = (depts ?? []).map(d => {
      const headId = headPersonByDept.get(d.id)
      return {
        ...d,
        head_name: (headId && headPersons?.find(p => p.id === headId)?.full_name) || null,
        employee_count: countByDept[d.id] ?? 0,
      }
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSuperadmin()
    const sb = createServerClient()
    const body = await request.json() as { name: string; name_he?: string | null; name_en?: string | null; parent_id?: string | null; sort_order?: number; description?: string | null }

    if (!body.name) return apiError('title_required', 400)

    // Try inserting with sort_order/description/переводы; fall back to base columns
    // if migration not yet applied (deploy-safe).
    const insertFull = await sb.from('departments')
      .insert({
        name: body.name,
        name_he: body.name_he?.trim() || null,
        name_en: body.name_en?.trim() || null,
        parent_id: body.parent_id ?? null,
        sort_order: body.sort_order ?? 0, description: body.description ?? null,
      })
      .select('*').single()

    let data = insertFull.data
    if (insertFull.error) {
      const insertBase = await sb.from('departments')
        .insert({ name: body.name, parent_id: body.parent_id ?? null })
        .select('*').single()
      if (insertBase.error) throw insertBase.error
      data = insertBase.data
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
