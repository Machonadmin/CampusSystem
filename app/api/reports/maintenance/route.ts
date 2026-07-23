import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireReportsPrivilege } from '@/lib/reports/permissions'
import { errorResponse } from '@/lib/reports/http'
import { pageAll } from '@/lib/reports/paging'
import { maintenanceSummary } from '@/lib/reports/summaries'

/**
 * GET /api/reports/maintenance — READ-ONLY.
 *
 * Сводка заявок обслуживания (текущая нагрузка):
 *   open / in_progress — активные заявки,
 *   overdue            — активные заявки, просроченные по SLA (reuse isOverdue),
 *   by_priority        — разбивка активных заявок по приоритету.
 * Право: reports.view.
 *
 * Корректность: заявки читаются ПОСТРАНИЧНО (status, priority, reported_at) —
 * подсчёт по строкам обрезался бы на db-max-rows. SLA-просрочка меряется в ЧАСАХ
 * (isOverdue → ticketAgeHours), поэтому «сейчас» передаётся ПОЛНЫМ ISO-таймстампом
 * (не датой) — иначе внутридневная просрочка (особенно urgent, 4ч) занижалась бы
 * до полуночи. Date.now в чистой логике не вызывается — момент вычисляется здесь.
 *
 * Ответ: { open, in_progress, overdue, by_priority }.
 */
export async function GET() {
  try {
    await requireReportsPrivilege('view')
    const sb = createServerClient()

    const nowISO = new Date().toISOString()
    const tickets = await pageAll<{ status: string; priority: string; reported_at: string }>(
      (from, to) =>
        sb
          .from('maintenance_requests')
          .select('status, priority, reported_at')
          .order('id', { ascending: true })
          .range(from, to),
    )

    return NextResponse.json(maintenanceSummary(tickets, nowISO))
  } catch (err: unknown) {
    return errorResponse(err)
  }
}
