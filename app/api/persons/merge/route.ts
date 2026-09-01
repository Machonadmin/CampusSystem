import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

/**
 * Слияние дублей человека.
 *   GET  /api/persons/merge?keep=A&remove=B — предпросмотр: оба человека (поля)
 *        + сколько связанных записей у «удаляемого» переедет к «выжившему».
 *   POST /api/persons/merge — выполнить слияние (RPC merge_persons).
 * Право: superadmin.
 */

const PERSON_COLS = 'id, last_name, first_name, middle_name, hebrew_name, email, gender, birth_date, passport_number, marital_status, nationality, photo_url, phones, address, full_name'

// Важнейшие таблицы, чьи связи показываем в предпросмотре (что «переедет»).
// Полное переназначение делает RPC по всем внешним ключам; здесь — обзор для человека.
const LINK_TABLES: { table: string; column: string; label_key: string }[] = [
  { table: 'staff_positions', column: 'person_id', label_key: 'positions' },
  { table: 'staff_profiles', column: 'person_id', label_key: 'profiles' },
  { table: 'person_roles', column: 'person_id', label_key: 'roles' },
  { table: 'person_accounts', column: 'person_id', label_key: 'accounts' },
  { table: 'person_privileges', column: 'person_id', label_key: 'privileges' },
  { table: 'students', column: 'person_id', label_key: 'students' },
  { table: 'education_journeys', column: 'person_id', label_key: 'journeys' },
  { table: 'person_documents', column: 'person_id', label_key: 'documents' },
  { table: 'person_relatives', column: 'person_id', label_key: 'relatives' },
  { table: 'notifications', column: 'person_id', label_key: 'notifications' },
  { table: 'task_watchers', column: 'person_id', label_key: 'tasks' },
]

async function guard() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  if (!session.roles.includes('superadmin')) throw Object.assign(new Error(serverT('forbidden')), { status: 403 })
  return session
}

export async function GET(request: NextRequest) {
  try {
    await guard()
    const keep = request.nextUrl.searchParams.get('keep')
    const remove = request.nextUrl.searchParams.get('remove')
    if (!keep || !remove) return apiError('bad_request', 400)
    if (keep === remove) return apiError('bad_request', 400)

    const sb = createServerClient()
    const { data: people, error } = await sb.from('persons').select(PERSON_COLS).in('id', [keep, remove])
    if (error) throw error
    const keepPerson = (people ?? []).find(p => p.id === keep)
    const removePerson = (people ?? []).find(p => p.id === remove)
    if (!keepPerson || !removePerson) return apiError('person_not_found', 404)

    // Считаем связи «удаляемого» по каждой важной таблице.
    const links = await Promise.all(LINK_TABLES.map(async lt => {
      const { count } = await sb
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(lt.table as any)
        .select('*', { count: 'exact', head: true })
        .eq(lt.column, remove)
      return { key: lt.label_key, count: count ?? 0 }
    }))

    return NextResponse.json({
      keep: keepPerson,
      remove: removePerson,
      links: links.filter(l => l.count > 0),
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await guard()
    const body = await request.json().catch(() => ({})) as {
      keep_id?: string
      remove_id?: string
      fields?: Record<string, unknown>
    }
    if (!body.keep_id || !body.remove_id) return apiError('bad_request', 400)
    if (body.keep_id === body.remove_id) return apiError('bad_request', 400)

    const sb = createServerClient()
    const { data, error } = await sb.rpc('merge_persons', {
      p_keep: body.keep_id,
      p_remove: body.remove_id,
      p_keep_fields: (body.fields ?? {}) as never,
      p_actor: session.person_id,
    })
    if (error) {
      // 22023 — bad input; P0002 — не найден.
      const code = (error as { code?: string }).code
      if (code === 'P0002') return apiError('person_not_found', 404)
      if (code === '22023') return apiError('bad_request', 400)
      throw error
    }

    return NextResponse.json({ ok: true, result: data })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
