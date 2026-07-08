import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireSecurityPrivilege } from '@/lib/security/permissions'
import { mapDbError } from '@/lib/security/http'
import { buildingsList } from '@/lib/security/locations-server'

/**
 * GET /api/security/buildings — здания общежития для пикера места происшествия
 * в форме инцидента. Гейтится правом security.view — модуль НЕ coupled с правами
 * модуля «Общежитие». Право: security.view.
 */
export async function GET() {
  try {
    await requireSecurityPrivilege('view')

    const sb = createServerClient()
    const buildings = await buildingsList(sb)

    return NextResponse.json({ buildings })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
