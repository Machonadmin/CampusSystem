import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { mapDbError } from '@/lib/tasks/helpers'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  return session
}

/**
 * GET /api/tasks/series/[seriesId] — информация о серии.
 * Query params:
 *   - from_date=YYYY-MM-DD — вернуть только задачи со сроком >= from_date
 * Доступ — автор серии, суперадмин, или исполнитель любой из задач серии.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { seriesId: string } }
) {
  try {
    const session = await requireAuth()
    const sb = createServerClient()

    const fromDate = request.nextUrl.searchParams.get('from_date')
    if (fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
      return apiError('from_date_must_be_ymd', 400)
    }

    // Права проверяем по всей серии, независимо от from_date
    const { data: allTasksForPerm } = await sb
      .from('tasks')
      .select('creator_id, assignee_id')
      .eq('recurrence_series_id', params.seriesId)
      .limit(100)

    if (!allTasksForPerm || allTasksForPerm.length === 0) {
      return apiError('series_not_found', 404)
    }

    const isSuperadmin = session.roles?.includes('superadmin') ?? false
    const isCreator = allTasksForPerm[0].creator_id === session.person_id
    const isAssignee = allTasksForPerm.some(t => t.assignee_id === session.person_id)
    if (!isSuperadmin && !isCreator && !isAssignee) {
      return apiError('no_access_to_series', 403)
    }

    // Основной запрос: с фильтром по from_date если задан
    let qb = sb
      .from('tasks')
      .select('id, title, status, due_date, due_time, recurrence_position, creator_id, assignee_id')
      .eq('recurrence_series_id', params.seriesId)
      .order('recurrence_position')
    if (fromDate) qb = qb.gte('due_date', fromDate)

    const { data: tasks, error } = await qb
    if (error) throw error

    const byStatus = (tasks ?? []).reduce((acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    return NextResponse.json({
      series_id: params.seriesId,
      total: tasks?.length ?? 0,
      by_status: byStatus,
      first_date: tasks?.[0]?.due_date ?? null,
      last_date: tasks?.[tasks.length - 1]?.due_date ?? null,
      tasks: tasks ?? [],
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

/**
 * DELETE /api/tasks/series/[seriesId] — удалить серию (или хвост от from_date).
 *
 * Query params:
 *   - from_date=YYYY-MM-DD — удалить только задачи со сроком >= from_date
 *
 * Не трогает completed, cancelled, in_progress, review задачи.
 * Доступ — только автор серии или суперадмин.
 *
 * Возвращает: { deleted_count, from_date, preserved_count, preserved_by_status }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { seriesId: string } }
) {
  try {
    const session = await requireAuth()
    const sb = createServerClient()

    const fromDate = request.nextUrl.searchParams.get('from_date')
    if (fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
      return apiError('from_date_must_be_ymd', 400)
    }

    // Проверка прав через первую задачу серии
    const { data: firstTask, error: fErr } = await sb
      .from('tasks')
      .select('creator_id')
      .eq('recurrence_series_id', params.seriesId)
      .limit(1)
      .maybeSingle()
    if (fErr) throw fErr
    if (!firstTask) {
      return apiError('series_not_found', 404)
    }

    const isCreator = firstTask.creator_id === session.person_id
    const isSuperadmin = session.roles?.includes('superadmin') ?? false
    if (!isCreator && !isSuperadmin) {
      return apiError('only_author_can_delete_series', 403)
    }

    // Сначала считаем сколько будет удалено
    let countQuery = sb
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('recurrence_series_id', params.seriesId)
      .not('status', 'in', '("completed","cancelled","in_progress","review")')
    if (fromDate) countQuery = countQuery.gte('due_date', fromDate)
    const { count, error: cntErr } = await countQuery
    if (cntErr) throw cntErr

    // Удаляем
    let deleteQuery = sb
      .from('tasks')
      .delete()
      .eq('recurrence_series_id', params.seriesId)
      .not('status', 'in', '("completed","cancelled","in_progress","review")')
    if (fromDate) deleteQuery = deleteQuery.gte('due_date', fromDate)
    const { error: dErr } = await deleteQuery
    if (dErr) {
      const m = mapDbError(dErr)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    // Считаем, сколько задач осталось в защищённых активных статусах
    let preservedQuery = sb
      .from('tasks')
      .select('id, status')
      .eq('recurrence_series_id', params.seriesId)
      .in('status', ['in_progress', 'review'])
    if (fromDate) preservedQuery = preservedQuery.gte('due_date', fromDate)
    const { data: preserved, error: pErr } = await preservedQuery
    if (pErr) throw pErr

    const preservedByStatus = (preserved ?? []).reduce((acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    return NextResponse.json({
      deleted_count: count ?? 0,
      from_date: fromDate ?? null,
      preserved_count: preserved?.length ?? 0,
      preserved_by_status: preservedByStatus,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
