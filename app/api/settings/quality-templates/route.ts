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
  return session
}

type Block = { questions?: unknown[] }
type Structure = { blocks?: Block[] }

function countQuestions(structure: Structure): number {
  return (structure?.blocks ?? []).reduce(
    (sum: number, b: Block) => sum + (b.questions?.length ?? 0), 0
  )
}

export async function GET() {
  try {
    await requireAuth()
    const sb = createServerClient()

    const { data, error } = await sb
      .from('quality_check_templates')
      .select('id, name, description, created_at, is_active, structure')
      .order('created_at', { ascending: false })

    if (error) throw error

    const result = (data ?? []).map(t => {
      const structure = t.structure as Structure
      const blocks = structure?.blocks ?? []
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        created_at: t.created_at,
        is_active: t.is_active,
        block_count: blocks.length,
        question_count: countQuestions(structure),
      }
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSuperadmin()
    const sb = createServerClient()
    const body = await request.json() as { name?: string; description?: string; structure?: unknown }

    if (!body.name?.trim()) return NextResponse.json({ error: 'Название обязательно' }, { status: 400 })
    if (!body.structure)    return NextResponse.json({ error: 'Структура обязательна' }, { status: 400 })

    const { data, error } = await sb
      .from('quality_check_templates')
      .insert({
        name: body.name.trim(),
        description: body.description?.trim() || null,
        structure: body.structure as Record<string, unknown>,
        created_by: session.person_id,
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
