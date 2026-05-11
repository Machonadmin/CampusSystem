import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { mapDbError } from '@/lib/tasks/helpers'
import {
  generateSeriesDates,
  validateRecurrenceRule,
  type RecurrenceRule,
} from '@/lib/tasks/recurrence'
import type {
  TaskInsert, TaskModule, TaskPriority, TaskAssigneeType, Json,
} from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

/**
 * POST /api/tasks/series — создание серии повторяющихся задач.
 *
 * Body:
 *   {
 *     title: string,
 *     description?: string,
 *     module?: TaskModule,
 *     metadata?: object,
 *     assignee_mode: 'me' | 'person' | 'department',
 *     assignee_id?: string,
 *     department_id?: string,
 *     priority?: TaskPriority,
 *     start_date: 'YYYY-MM-DD',
 *     due_time?: 'HH:MM' | null,
 *     due_all_day?: boolean,
 *     recurrence_rule: RecurrenceRule,
 *     watchers?: string[]
 *   }
 *
 * Возвращает: { series_id, tasks_count, end_date, first_task_id }
 */
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
      start_date?: string
      due_time?: string | null
      due_all_day?: boolean
      recurrence_rule?: RecurrenceRule
      watchers?: string[]
    }

    // ─── Валидация title ───
    const title = body.title?.trim()
    if (!title) {
      return NextResponse.json({ error: 'Заголовок обязателен' }, { status: 400 })
    }
    if (title.length > 500) {
      return NextResponse.json({ error: 'Заголовок слишком длинный (макс 500)' }, { status: 400 })
    }

    // ─── Валидация start_date ───
    if (!body.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
      return NextResponse.json(
        { error: 'start_date обязателен в формате YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // ─── Валидация recurrence_rule ───
    if (!body.recurrence_rule) {
      return NextResponse.json({ error: 'recurrence_rule обязателен' }, { status: 400 })
    }
    try {
      validateRecurrenceRule(body.recurrence_rule)
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string }
      return NextResponse.json({ error: err.message ?? 'Невалидное правило' }, { status: err.status ?? 400 })
    }

    // ─── Назначение ───
    const assigneeMode = body.assignee_mode ?? 'me'
    let assignee_type: TaskAssigneeType = 'person'
    let assignee_id: string | null = null
    let department_id: string | null = null
    // Для серии assignee='me' → pending, не in_progress (нельзя работать над всеми сразу)
    let status: 'pending' | 'in_progress' | 'unassigned' = 'pending'

    if (assigneeMode === 'me') {
      assignee_type = 'person'
      assignee_id = personId
      status = 'pending'
    } else if (assigneeMode === 'person') {
      if (!body.assignee_id) {
        return NextResponse.json({ error: 'Не указан исполнитель' }, { status: 400 })
      }
      assignee_type = 'person'
      assignee_id = body.assignee_id
      status = 'pending'
    } else if (assigneeMode === 'department') {
      if (!body.department_id) {
        return NextResponse.json({ error: 'Не указан отдел' }, { status: 400 })
      }
      assignee_type = 'department'
      department_id = body.department_id
      status = 'unassigned'
    } else {
      return NextResponse.json({ error: 'Неизвестный режим назначения' }, { status: 400 })
    }

    // ─── Сроки ───
    const due_all_day = body.due_all_day ?? true
    if (due_all_day && body.due_time) {
      return NextResponse.json({ error: 'Если "весь день" — время не указывается' }, { status: 400 })
    }
    if (!due_all_day && !body.due_time) {
      return NextResponse.json({ error: 'Если "весь день" выключен — нужно указать время' }, { status: 400 })
    }

    // ─── Генерация дат ───
    let dates: Array<{ due_date: string }>
    try {
      dates = generateSeriesDates(body.recurrence_rule, body.start_date)
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string }
      return NextResponse.json({ error: err.message ?? 'Ошибка генерации дат' }, { status: err.status ?? 400 })
    }

    // ─── Батч-вставка ───
    const series_id = crypto.randomUUID()
    const ruleJson = body.recurrence_rule as unknown as Json

    const rows: TaskInsert[] = dates.map((d, idx) => ({
      title,
      description: body.description?.trim() || null,
      module: body.module ?? 'general',
      metadata: (body.metadata ?? {}) as Json,
      assignee_type,
      assignee_id,
      department_id,
      creator_id: personId,
      status,
      priority: body.priority ?? 'normal',
      due_date: d.due_date,
      due_time: body.due_time ?? null,
      due_all_day,
      recurrence_series_id: series_id,
      recurrence_rule: ruleJson,
      recurrence_position: idx + 1,
    }))

    const sb = createServerClient()
    const { data: created, error: insertErr } = await sb
      .from('tasks')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(rows as any)
      .select('id, due_date, recurrence_position')
      .order('recurrence_position')

    if (insertErr) {
      const m = mapDbError(insertErr)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    // ─── История (только первая задача серии) ───
    if (created && created.length > 0) {
      await sb.from('task_status_history').insert({
        task_id: created[0].id,
        actor_id: personId,
        from_status: null,
        to_status: status,
        note: `Серия создана (${created.length} задач)`,
      })
    }

    // ─── Watchers ───
    if (body.watchers && body.watchers.length > 0 && created) {
      const uniqueWatchers = Array.from(new Set(body.watchers.filter(w => w !== personId)))
      const watcherRows = created.flatMap(task =>
        uniqueWatchers.map(person_id => ({
          task_id: task.id,
          person_id,
          added_by: personId,
        }))
      )
      if (watcherRows.length > 0) {
        await sb
          .from('task_watchers')
          .upsert(watcherRows, { onConflict: 'task_id,person_id', ignoreDuplicates: true })
      }
    }

    return NextResponse.json({
      series_id,
      tasks_count: dates.length,
      end_date: dates[dates.length - 1].due_date,
      first_task_id: created?.[0]?.id ?? null,
    }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
