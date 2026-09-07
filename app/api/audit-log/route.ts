import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'
import { createServerClient } from '@/lib/supabase/server'
import { parseAuditQuery } from '@/lib/audit/query'

/**
 * GET /api/audit-log — ЧТЕНИЕ журнала изменений (`audit_log`), который ведут
 * триггеры БД на 8 чувствительных таблицах. До сих пор его никто не читал —
 * «кто что изменил» можно было узнать только SQL-ом в Supabase (аудит §17.6).
 *
 * Фильтры: entity_type, entity_id, changed_by, action, from/to (по changed_at).
 * Пагинация: limit (≤200) / offset. Сортировка — новые сверху.
 *
 * Право: superadmin — как остальные экраны настроек прав. Журнал отдаёт ПОЛНЫЕ
 * old_data/new_data чувствительных таблиц, поэтому шире не открываем. Fail-closed.
 * Только чтение: ни записи, ни отката тут нет.
 *
 * Deploy-safe: нет таблицы (42P01) → пустой ответ с not_migrated:true.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!session.roles.includes('superadmin')) return apiError('forbidden', 403)

    const params = request.nextUrl.searchParams
    const q = parseAuditQuery(k => params.get(k))

    const sb = createServerClient()
    let qb = sb
      .from('audit_log')
      .select('id, entity_type, entity_id, action, old_data, new_data, changed_fields, changed_by, changed_at', { count: 'exact' })
      .order('changed_at', { ascending: false })
      .range(q.offset, q.offset + q.limit - 1)

    if (q.entityType) qb = qb.eq('entity_type', q.entityType)
    if (q.entityId) qb = qb.eq('entity_id', q.entityId)
    if (q.changedBy) qb = qb.eq('changed_by', q.changedBy)
    if (q.action) qb = qb.eq('action', q.action)
    if (q.from) qb = qb.gte('changed_at', `${q.from}T00:00:00Z`)
    // to — включительно: берём весь последний день.
    if (q.to) qb = qb.lte('changed_at', `${q.to}T23:59:59.999Z`)

    const { data, error, count } = await qb
    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ entries: [], total: 0, not_migrated: true })
      }
      throw error
    }

    const rows = data ?? []

    // Имя того, кто изменил. Отдельным запросом: changed_by может быть NULL для
    // обычных PostgREST-записей (документированное ограничение миграции) — такие
    // строки НЕ прячем, просто отдаём changed_by_name = null.
    const actorIds = [...new Set(rows.map(r => r.changed_by).filter((v): v is string => !!v))]
    const nameById = new Map<string, string | null>()
    if (actorIds.length > 0) {
      const { data: persons } = await sb.from('persons').select('id, full_name').in('id', actorIds)
      for (const p of (persons ?? []) as Array<{ id: string; full_name: string | null }>) {
        nameById.set(p.id, p.full_name)
      }
    }

    return NextResponse.json({
      entries: rows.map(r => ({ ...r, changed_by_name: r.changed_by ? (nameById.get(r.changed_by) ?? null) : null })),
      total: count ?? 0,
      limit: q.limit,
      offset: q.offset,
      not_migrated: false,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
