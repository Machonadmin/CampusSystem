import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import type { PrivilegeModule } from '@/types/database'

/**
 * Персональные привилегии человека (person_privileges) — точечные grant/deny
 * ПОВЕРХ ролей, управляются менеджером в Настройках (как role-privileges, но для
 * человека). Enforcement уже платформенный (см. lib/permissions/person-grants).
 *
 *   GET  ?person_id= → { modulePrivileges (каталог), personPrivileges }
 *   PUT  { person_id, privileges:[{module,privilege_code,is_granted}] } — заменить всё.
 * Право: superadmin (как остальные настройки прав). Пустая privileges = снять все оверрайды.
 */
async function guard() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 })
  return session
}

export async function GET(request: NextRequest) {
  try {
    await guard()
    const sb = createServerClient()
    const personId = request.nextUrl.searchParams.get('person_id')

    const [{ data: modulePrivs }, personPrivs] = await Promise.all([
      sb.from('module_privileges').select('*').order('module').order('sort_order'),
      personId
        ? sb.from('person_privileges').select('module, privilege_code, is_granted').eq('person_id', personId)
        : Promise.resolve({ data: [] as { module: string; privilege_code: string; is_granted: boolean }[] }),
    ])

    return NextResponse.json({
      modulePrivileges: modulePrivs ?? [],
      personPrivileges: personPrivs.data ?? [],
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

// PUT — полностью заменить персональные оверрайды человека.
export async function PUT(request: NextRequest) {
  try {
    const session = await guard()
    const sb = createServerClient()
    const { person_id, privileges } = await request.json() as {
      person_id: string
      privileges: { module: string; privilege_code: string; is_granted: boolean }[]
    }
    if (!person_id) return NextResponse.json({ error: serverT('invalid_reference') }, { status: 400 })

    await sb.from('person_privileges').delete().eq('person_id', person_id)

    const rows = (privileges ?? []).filter(p => p.module && p.privilege_code)
    if (rows.length > 0) {
      const { error } = await sb.from('person_privileges').insert(
        rows.map(p => ({
          person_id,
          module: p.module as PrivilegeModule,
          privilege_code: p.privilege_code,
          is_granted: !!p.is_granted,
          reason: null,
          expires_at: null,
          granted_by: session.person_id,
        })),
      )
      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
