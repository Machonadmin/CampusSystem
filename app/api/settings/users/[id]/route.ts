import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
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
      // Name update — prefer split fields; full_name is legacy fallback → first_name
      last_name?: string | null
      first_name?: string
      middle_name?: string | null
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

    // Name fields belong to persons — look up person_id first
    if (body.first_name || body.last_name !== undefined || body.middle_name !== undefined || body.full_name) {
      const { data: acc } = await sb
        .from('person_accounts')
        .select('person_id')
        .eq('id', params.id)
        .single()
      if (acc?.person_id) {
        const personUpdate: Record<string, string | null> = {}
        if (body.first_name?.trim()) {
          personUpdate.first_name  = body.first_name.trim()
          personUpdate.last_name   = body.last_name?.trim() || null
          personUpdate.middle_name = body.middle_name?.trim() || null
        } else if (body.full_name?.trim()) {
          // Legacy: put full_name into first_name
          personUpdate.first_name = body.full_name.trim()
        }
        if (Object.keys(personUpdate).length > 0) {
          const { error } = await sb.from('persons').update(personUpdate).eq('id', acc.person_id)
          if (error) throw error
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
