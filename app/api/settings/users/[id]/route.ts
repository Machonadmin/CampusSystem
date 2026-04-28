import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

async function guard() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await guard()
    const sb = createServerClient()
    const body = await request.json() as {
      is_active?: boolean
      login_email?: string
      full_name?: string
    }

    // Fields that belong to person_accounts
    const acctUpdate: Record<string, unknown> = {}
    if (body.is_active !== undefined) acctUpdate.is_active = body.is_active
    if (body.login_email) acctUpdate.login_email = body.login_email.toLowerCase().trim()

    if (Object.keys(acctUpdate).length > 0) {
      const { error } = await sb.from('person_accounts').update(acctUpdate).eq('id', params.id)
      if (error) throw error
    }

    // full_name belongs to persons — look up person_id first
    if (body.full_name) {
      const { data: acc } = await sb
        .from('person_accounts')
        .select('person_id')
        .eq('id', params.id)
        .single()
      if (acc?.person_id) {
        const { error } = await sb
          .from('persons')
          .update({ full_name: body.full_name })
          .eq('id', acc.person_id)
        if (error) throw error
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
