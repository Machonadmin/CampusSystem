import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
}

async function requireSuperadmin() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 })
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth()
    const sb = createServerClient()

    const { data, error } = await sb
      .from('quality_check_templates')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireSuperadmin()
    const sb = createServerClient()
    const body = await request.json() as { name?: string; description?: string; structure?: unknown }

    if (!body.name?.trim()) return NextResponse.json({ error: 'Название обязательно' }, { status: 400 })
    if (!body.structure)    return NextResponse.json({ error: 'Структура обязательна' }, { status: 400 })

    const { data, error } = await sb
      .from('quality_check_templates')
      .update({
        name: body.name.trim(),
        description: body.description?.trim() || null,
        structure: body.structure as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireSuperadmin()
    const sb = createServerClient()

    const { count } = await sb
      .from('quality_checks')
      .select('*', { count: 'exact', head: true })
      .eq('template_id', params.id)

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: `Шаблон используется в ${count} проверках и не может быть удалён` },
        { status: 409 }
      )
    }

    const { error } = await sb
      .from('quality_check_templates')
      .delete()
      .eq('id', params.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
