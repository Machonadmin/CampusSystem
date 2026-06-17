import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const sb = createServerClient()
    const { data, error } = await sb
      .from('document_types')
      .select('id, category_id, code, name_ru, description, is_required, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (err: unknown) {
    const e = err as { message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: 500 })
  }
}
