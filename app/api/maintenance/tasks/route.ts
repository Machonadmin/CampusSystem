import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { fetchAllPages } from '@/lib/api/handler'
import { createServerClient } from '@/lib/supabase/server'
import { requireMaintenancePrivilege } from '@/lib/maintenance/permissions'
import { mapDbError } from '@/lib/maintenance/http'
import { priorityRank } from '@/lib/maintenance/tickets'
import { MAINTENANCE_METADATA_FILTER } from '@/lib/tasks/maintenance-link'
import { isOpenTaskStatus, simplifyTaskStatus } from '@/lib/tasks/status'
import type { TaskStatus } from '@/types/database'

/**
 * GET /api/maintenance/tasks — задачи из модуля «Задачи», помеченные автором
 * как задачи по эксплуатации (tasks.metadata.maintenance = true).
 *
 * Это НЕ копии заявок: отдельная строка в maintenance_requests не создаётся,
 * это те же самые задачи, показанные вторым экраном. Поэтому «выполнено»
 * здесь и «выполнено» в «Задачах» — одно и то же событие.
 *
 * Право: maintenance.view («техслужба видит техслужбу» — решение владельца;
 * разделения «руководитель видит всех / сотрудник только своё» пока НЕТ,
 * размер команды ещё не известен).
 *
 * ?status=open (по умолчанию) | all
 */

const PAGE = 1000

interface Row {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: string
  due_date: string | null
  due_time: string | null
  due_all_day: boolean
  created_at: string
  completed_at: string | null
  assignee_id: string | null
  assignee: { id: string; full_name: string | null; hebrew_name: string | null } | null
  creator: { id: string; full_name: string | null; hebrew_name: string | null } | null
}

function displayName(p: Row['assignee']): string | null {
  if (!p) return null
  return p.hebrew_name || p.full_name || null
}

export async function GET(request: NextRequest) {
  try {
    await requireMaintenancePrivilege('view')

    const wantAll = request.nextUrl.searchParams.get('status') === 'all'
    const sb = createServerClient()

    // Запрос пересобирается на каждой странице: один PostgrestBuilder нельзя
    // await-ить дважды. Вторичная сортировка по id — стабильная пагинация.
    const buildQuery = () => sb
      .from('tasks')
      .select(`
        id, title, description, status, priority, due_date, due_time, due_all_day,
        created_at, completed_at, assignee_id,
        assignee:persons!tasks_assignee_id_fkey(id, full_name, hebrew_name),
        creator:persons!tasks_creator_id_fkey(id, full_name, hebrew_name)
      `)
      .contains('metadata', MAINTENANCE_METADATA_FILTER)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })

    const all = await fetchAllPages<Row>((from, to) => buildQuery().range(from, to) as unknown as
      PromiseLike<{ data: Row[] | null; error: unknown }>, PAGE)

    const rows = wantAll ? all : all.filter(r => isOpenTaskStatus(r.status))

    // Порядок как в списке заявок: сначала важное, затем по сроку (задачи без
    // срока — в конец), затем более старые выше.
    rows.sort((a, b) => {
      const pr = priorityRank(b.priority) - priorityRank(a.priority)
      if (pr !== 0) return pr
      const ad = a.due_date ?? '9999-12-31'
      const bd = b.due_date ?? '9999-12-31'
      if (ad !== bd) return ad < bd ? -1 : 1
      return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
    })

    const tasks = rows.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status,
      state: simplifyTaskStatus(r.status),
      priority: r.priority,
      due_date: r.due_date,
      due_time: r.due_time,
      due_all_day: r.due_all_day,
      assignee_id: r.assignee_id,
      assignee_name: displayName(r.assignee),
      creator_name: displayName(r.creator),
    }))

    return NextResponse.json({ tasks, total: tasks.length, open: all.filter(r => isOpenTaskStatus(r.status)).length })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
