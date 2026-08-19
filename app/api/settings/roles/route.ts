import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import type { RoleCode, RoleCategory } from '@/types/database'

async function guard() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 })
}

export async function GET() {
  try {
    await guard()
    const sb = createServerClient()
    const { data, error } = await sb.from('roles').select('*').order('category').order('name')
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await guard()
    const sb = createServerClient()
    const body = await request.json() as { name: string; code: string; category: string; description?: string }

    if (!body.name || !body.code || !body.category)
      return apiError('required_fields_missing', 400)

    const { data, error } = await sb.from('roles')
      .insert({ name: body.name, code: body.code as RoleCode, category: body.category as RoleCategory, description: body.description ?? null, is_system: false })
      .select('*').single()
    if (error) throw error

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code === '23505') return apiError('role_code_exists', 409)
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
