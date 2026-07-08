import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { mapDbError } from '@/lib/calendar/http'
import { isIsoDate } from '@/lib/calendar/validation'

/**
 * ЛИЧНЫЙ календарь — мои задачи с дедлайном. ТОЛЬКО чтение.
 *
 * GET /api/calendar/tasks?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   — задачи, назначенные лично мне (tasks.assignee_id = session.person_id),
 *     у которых есть дата дедлайна due_date в диапазоне [from, to] (обе границы
 *     включительно) и статус НЕ в ('completed','cancelled','declined').
 *     Self-scoped ровно как остальной календарь. from/to опциональны; при их
 *     отсутствии отдаём только задачи с непустым due_date.
 *
 * Задачи на календаре read-only: ведутся в модуле «Tasks». Клик открывает
 * маленькую карточку со ссылкой на /dashboard/tasks/{id}.
 *
 * Каждый элемент: { id, title, due_date, due_time, due_all_day, status }.
 */

// Читаем постранично: у активного пользователя задач может быть >1000.
const PAGE = 1000

// Статусы, которые НЕ показываем на календаре (задача закрыта/снята).
const HIDDEN_STATUSES = '(completed,cancelled,declined)'

export async function GET(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const sb = createServerClient()

    const from = request.nextUrl.searchParams.get('from')?.trim()
    const to = request.nextUrl.searchParams.get('to')?.trim()
    if (from && !isIsoDate(from)) {
      return NextResponse.json({ error: 'from должен быть датой YYYY-MM-DD' }, { status: 400 })
    }
    if (to && !isIsoDate(to)) {
      return NextResponse.json({ error: 'to должен быть датой YYYY-MM-DD' }, { status: 400 })
    }

    type TaskRow = {
      id: string
      title: string
      due_date: string | null
      due_time: string | null
      due_all_day: boolean
      status: string
    }

    // Мои задачи с дедлайном в диапазоне (постранично). Порядок с тай-брейком по
    // id — чтобы страницы не пересекались и не теряли строк.
    const rows: TaskRow[] = []
    {
      let offset = 0
      for (;;) {
        let q = sb
          .from('tasks')
          .select('id, title, due_date, due_time, due_all_day, status')
          .eq('assignee_id', session.person_id)
          .not('due_date', 'is', null)
          .not('status', 'in', HIDDEN_STATUSES)
          .order('due_date', { ascending: true })
          .order('due_time', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true })
          .range(offset, offset + PAGE - 1)
        if (from) q = q.gte('due_date', from)
        if (to) q = q.lte('due_date', to)

        const { data, error } = await q
        if (error) throw error
        const page = (data ?? []) as TaskRow[]
        rows.push(...page)
        if (page.length < PAGE) break
        offset += PAGE
      }
    }

    const tasks = rows.map(t => ({
      id: t.id,
      title: t.title,
      due_date: t.due_date,
      due_time: t.due_time,
      due_all_day: t.due_all_day,
      status: t.status,
    }))

    return NextResponse.json({ tasks })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
