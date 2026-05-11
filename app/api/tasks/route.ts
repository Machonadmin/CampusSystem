import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { getPersonDepartments, mapDbError } from '@/lib/tasks/helpers'
import type {
  TaskInsert, TaskStatus, TaskModule, TaskPriority, TaskAssigneeType,
} from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

// ─── GET /api/tasks ───────────────────────────────────────────────────────────
// ?view=assigned|created|department|watching  (default: assigned)
// ?status=<TaskStatus>|active|all             (default: active)
// ?module=<TaskModule>
// ?priority=<TaskPriority>
// ?department_id=<UUID>                       (только для view=department)
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth()
    const personId = session.person_id
    const params = request.nextUrl.searchParams

    const view = (params.get('view') ?? 'assigned') as 'assigned' | 'created' | 'department' | 'watching'
    const statusFilter = params.get('status')
    const moduleFilter = params.get('module') as TaskModule | null
    const priorityFilter = params.get('priority') as TaskPriority | null
    const departmentFilter = params.get('department_id')

    const sb = createServerClient()

    let query = sb
      .from('tasks')
      .select(`
        *,
        assignee:persons!tasks_assignee_id_fkey(id, full_name),
        creator:persons!tasks_creator_id_fkey(id, full_name),
        department:departments(id, name)
      `)
      .order('created_at', { ascending: false })

    // ─── Режим просмотра ───────────────────────────────────────────────────────
    if (view === 'assigned') {
      query = query.eq('assignee_id', personId)
    } else if (view === 'created') {
      query = query.eq('creator_id', personId)
    } else if (view === 'department') {
      const myDepts = await getPersonDepartments(personId)
      if (myDepts.length === 0) return NextResponse.json({ tasks: [] })
      query = query.in('department_id', myDepts)
      if (departmentFilter) query = query.eq('department_id', departmentFilter)
    } else if (view === 'watching') {
      const { data: watcherRows, error: wErr } = await sb
        .from('task_watchers')
        .select('task_id')
        .eq('person_id', personId)
      if (wErr) throw wErr
      const taskIds = (watcherRows ?? []).map(r => r.task_id)
      if (taskIds.length === 0) return NextResponse.json({ tasks: [] })
      query = query.in('id', taskIds)
    } else {
      throw Object.assign(new Error('Неизвестный режим просмотра'), { status: 400 })
    }

    // ─── Фильтр по статусу ────────────────────────────────────────────────────
    if (statusFilter === 'all') {
      // без фильтра
    } else if (statusFilter && statusFilter !== 'active') {
      query = query.eq('status', statusFilter as TaskStatus)
    } else {
      // 'active' или не указан — всё кроме completed/cancelled
      query = query.not('status', 'in', '("completed","cancelled")')
    }

    if (moduleFilter) query = query.eq('module', moduleFilter)
    if (priorityFilter) query = query.eq('priority', priorityFilter)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ tasks: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

// ─── POST /api/tasks ──────────────────────────────────────────────────────────
// assignee_mode:
//   'me'         → assignee_id = current user, status = 'in_progress'
//   'person'     → assignee_id = body.assignee_id, status = 'pending'
//   'department' → department_id = body.department_id, status = 'unassigned'
//
// Опционально: watchers: string[] (person_id[]) — добавляются в task_watchers.
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    const personId = session.person_id

    const body = await request.json() as {
      title?: string
      description?: string
      module?: TaskModule
      metadata?: Record<string, unknown>
      assignee_mode?: 'me' | 'person' | 'department'
      assignee_id?: string
      department_id?: string
      priority?: TaskPriority
      due_date?: string | null
      due_time?: string | null
      due_all_day?: boolean
      watchers?: string[]
    }

    // ─── Валидация заголовка ───────────────────────────────────────────────────
    const title = body.title?.trim()
    if (!title) return NextResponse.json({ error: 'Заголовок обязателен' }, { status: 400 })
    if (title.length > 500) return NextResponse.json({ error: 'Заголовок не должен превышать 500 символов' }, { status: 400 })
    if (body.description && body.description.length > 10000) return NextResponse.json({ error: 'Описание не должно превышать 10000 символов' }, { status: 400 })

    // ─── Режим назначения ──────────────────────────────────────────────────────
    const assigneeMode = body.assignee_mode ?? 'me'
    let assignee_type: TaskAssigneeType = 'person'
    let assignee_id: string | null = null
    let department_id: string | null = null
    let status: TaskStatus = 'pending'

    if (assigneeMode === 'me') {
      assignee_id = personId
      status = 'in_progress'
    } else if (assigneeMode === 'person') {
      if (!body.assignee_id) return NextResponse.json({ error: 'Не указан исполнитель' }, { status: 400 })
      assignee_id = body.assignee_id
      status = 'pending'
    } else if (assigneeMode === 'department') {
      if (!body.department_id) return NextResponse.json({ error: 'Не указан отдел' }, { status: 400 })
      assignee_type = 'department'
      department_id = body.department_id
      status = 'unassigned'
    } else {
      return NextResponse.json({ error: 'Неизвестный режим назначения' }, { status: 400 })
    }

    // ─── Валидация сроков ──────────────────────────────────────────────────────
    const due_all_day = body.due_all_day ?? true
    if (due_all_day && body.due_time) return NextResponse.json({ error: 'Если "весь день" — время не указывается' }, { status: 400 })
    if (!due_all_day && !body.due_time) return NextResponse.json({ error: 'Если "весь день" выключен — нужно указать время' }, { status: 400 })
    if (body.due_time && !body.due_date) return NextResponse.json({ error: 'Время указано без даты' }, { status: 400 })

    const insert: TaskInsert = {
      title,
      description: body.description?.trim() || null,
      module: body.module ?? 'general',
      metadata: (body.metadata ?? {}) as TaskInsert['metadata'],
      assignee_type,
      assignee_id,
      department_id,
      creator_id: personId,
      status,
      priority: body.priority ?? 'normal',
      due_date: body.due_date ?? null,
      due_time: body.due_time ?? null,
      due_all_day,
    }

    const sb = createServerClient()
    const { data: task, error: insertError } = await sb
      .from('tasks')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(insert as any)
      .select('*')
      .single()

    if (insertError) {
      const m = mapDbError(insertError)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    // ─── История статуса (создание) ────────────────────────────────────────────
    await sb.from('task_status_history').insert({
      task_id: task.id,
      actor_id: personId,
      from_status: null,
      to_status: status,
      note: 'Задача создана',
    })

    // ─── Watchers ──────────────────────────────────────────────────────────────
    if (body.watchers && body.watchers.length > 0) {
      const rows = body.watchers
        .filter(w => w !== personId)
        .map(person_id => ({ task_id: task.id, person_id, added_by: personId }))
      if (rows.length > 0) await sb.from('task_watchers').insert(rows)
    }

    return NextResponse.json(task, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
