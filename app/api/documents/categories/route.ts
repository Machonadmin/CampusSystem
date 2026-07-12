import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireDocumentsPrivilege } from '@/lib/documents/permissions'

export async function GET() {
  try {
    await requireDocumentsPrivilege('view')

    const sb = createServerClient()
    const { data, error } = await sb
      .from('document_categories')
      .select('id, code, name_ru, sort_order')
      .order('sort_order', { ascending: true })
    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
