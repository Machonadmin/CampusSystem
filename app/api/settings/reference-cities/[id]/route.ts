import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { errorResponse } from '@/lib/api/handler'

async function guard() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error(serverT('forbidden')), { status: 403 })
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    await guard()
    const body = await request.json() as { city?: string }
    const city = body.city?.trim()
    if (!city) return apiError('city_name_required', 400)

    const sb = createServerClient()
    const { error } = await sb
      .from('reference_cities')
      .update({ city })
      .eq('id', params.id)

    if (error) {
      if (error.code === '23505') {
        return apiError('city_exists', 409)
      }
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}

export async function DELETE(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    await guard()
    const sb = createServerClient()
    const { error } = await sb.from('reference_cities').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
