import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { mapDbError } from '@/lib/tasks/helpers'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

/**
 * GET /api/tasks/series/[seriesId] — информация о серии.
 * Доступ — автор серии, суперадмин, или исполнитель любой из задач серии.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { seriesId: string } }
) {
  try {
    const session = await requireAuth()
    const sb = createServerClient()

    const { data: tasks, error } = await sb
      .from('tasks')
      .select('id, title, status, due_date, due_time, recurrence_position, creator_id, assignee_id')
      .eq('recurrence_series_id', params.seriesId)
      .order('recurrence_position')

    if (error) throw error
    if (!tasks || tasks.length === 0) {
      return NextResponse.json({ error: 'Серия не найдена' }, { status: 404 })
    }

    const isSuperadmin = session.roles?.includes('superadmin') ?? false
    const isCreator = tasks[0].creator_id === session.person_id
    const isAssignee = tasks.some(t => t.assignee_id === session.person_id)
    if (!isSuperadmin && !isCreator && !isAssignee) {
      return NextResponse.json({ error: 'Нет доступа к серии' }, { status: 403 })
    }

    const byStatus = tasks.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)

    return NextResponse.json({
      series_id: params.seriesId,
      total: tasks.length,
      by_status: byStatus,
      first_date: tasks[0].due_date,
      last_date: tasks[tasks.length - 1].due_date,
      tasks,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

/**
 * DELETE /api/tasks/series/[seriesId] — удалить серию (или хвост от from_date).
 *
 * Query params:
 *   - from_date=YYYY-MM-DD — удалить только задачи со сроком >= from_date
 *
 * Не трогает completed/cancelled задачи.
 * Доступ — только автор серии или суперадмин.
 *
 * Возвращает: { deleted_count, from_date }
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
      return NextResponse.json({ error: 'from_date должен быть в формате YYYY-MM-DD' }, { status: 400 })
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
      return NextResponse.json({ error: 'Серия не найдена' }, { status: 404 })
    }

    const isCreator = firstTask.creator_id === session.person_id
    const isSuperadmin = session.roles?.includes('superadmin') ?? false
    if (!isCreator && !isSuperadmin) {
      return NextResponse.json(
        { error: 'Удалить серию может только автор' },
        { status: 403 }
      )
    }

    // Сначала считаем сколько будет удалено
    let countQuery = sb
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('recurrence_series_id', params.seriesId)
      .not('status', 'in', '("completed","cancelled")')
    if (fromDate) countQuery = countQuery.gte('due_date', fromDate)
    const { count, error: cntErr } = await countQuery
    if (cntErr) throw cntErr

    // Удаляем
    let deleteQuery = sb
      .from('tasks')
      .delete()
      .eq('recurrence_series_id', params.seriesId)
      .not('status', 'in', '("completed","cancelled")')
    if (fromDate) deleteQuery = deleteQuery.gte('due_date', fromDate)
    const { error: dErr } = await deleteQuery
    if (dErr) {
      const m = mapDbError(dErr)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json({
      deleted_count: count ?? 0,
      from_date: fromDate ?? null,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
