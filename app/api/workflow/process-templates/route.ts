import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

async function requireSuperadmin() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error('Доступ запрещён'), { status: 403 })
  return session
}

// GET /api/workflow/process-templates?active_only=true|false&code=...
export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const sb = createServerClient()
    const params = request.nextUrl.searchParams
    const activeOnly = params.get('active_only') !== 'false'
    const code = params.get('code')

    let query = sb.from('process_templates').select('*').order('name_ru')
    if (activeOnly) query = query.eq('is_active', true)
    if (code)       query = query.eq('code', code)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ templates: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

// POST /api/workflow/process-templates
export async function POST(request: NextRequest) {
  try {
    await requireSuperadmin()
    const sb = createServerClient()
    const body = await request.json() as { code?: string; name_ru?: string; description?: string }

    if (!body.code?.trim())    return NextResponse.json({ error: 'code обязателен' }, { status: 400 })
    if (!body.name_ru?.trim()) return NextResponse.json({ error: 'name_ru обязателен' }, { status: 400 })

    const { data, error } = await sb
      .from('process_templates')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        code:        body.code.trim(),
        name_ru:     body.name_ru.trim(),
        description: body.description?.trim() || null,
      } as any)
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505')
        return NextResponse.json({ error: 'Шаблон с таким кодом уже существует' }, { status: 409 })
      throw error
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
