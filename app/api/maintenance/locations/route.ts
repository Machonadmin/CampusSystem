import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireMaintenancePrivilege } from '@/lib/maintenance/permissions'
import { mapDbError } from '@/lib/maintenance/http'
import { locationTree } from '@/lib/maintenance/locations-server'

/**
 * GET /api/maintenance/locations — здания общежития + их комнаты для пикера
 * локации в форме заявки. Гейтится правом maintenance.view — модуль НЕ coupled
 * с правами модуля «Общежитие». Право: maintenance.view.
 */
export async function GET() {
  try {
    await requireMaintenancePrivilege('view')

    const sb = createServerClient()
    const buildings = await locationTree(sb)

    return NextResponse.json({ buildings })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
