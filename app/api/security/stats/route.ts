import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireSecurityPrivilege } from '@/lib/security/permissions'
import { mapDbError } from '@/lib/security/http'
import { incidentStats } from '@/lib/security/incidents'

/**
 * GET /api/security/stats — сводка для верхней панели: число инцидентов по
 * каждому статусу + разбивка по серьёзности + общее число активных (open +
 * investigating). Читается постранично (без N+1). Право: security.view.
 */

const PAGE = 1000

interface StatRow {
  status: string
  severity: string
}

export async function GET() {
  try {
    await requireSecurityPrivilege('view')

    const sb = createServerClient()

    const rows: StatRow[] = []
    let offset = 0
    for (;;) {
      const { data, error } = await sb
        .from('security_incidents')
        .select('status, severity')
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      const batch = (data ?? []) as unknown as StatRow[]
      rows.push(...batch)
      if (batch.length < PAGE) break
      offset += PAGE
    }

    return NextResponse.json(incidentStats(rows))
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
