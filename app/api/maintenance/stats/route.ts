import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireMaintenancePrivilege } from '@/lib/maintenance/permissions'
import { mapDbError } from '@/lib/maintenance/http'
import { statusCounts, isOverdue } from '@/lib/maintenance/tickets'

/**
 * GET /api/maintenance/stats — сводка для верхней панели: число заявок по
 * каждому статусу + общее число просроченных (открытых/в работе с превышением
 * SLA). Читается постранично (без N+1). Право: maintenance.view.
 */

const PAGE = 1000

interface StatRow {
  status: string
  priority: string
  reported_at: string
}

export async function GET() {
  try {
    await requireMaintenancePrivilege('view')

    const sb = createServerClient()

    const rows: StatRow[] = []
    let offset = 0
    for (;;) {
      const { data, error } = await sb
        .from('maintenance_requests')
        .select('status, priority, reported_at')
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      const batch = (data ?? []) as unknown as StatRow[]
      rows.push(...batch)
      if (batch.length < PAGE) break
      offset += PAGE
    }

    const now = new Date().toISOString()
    const status_counts = statusCounts(rows)
    const total_overdue = rows.filter(r => isOverdue(r, now)).length

    return NextResponse.json({ status_counts, total_overdue, total: rows.length })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
