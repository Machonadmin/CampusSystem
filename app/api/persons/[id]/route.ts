import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const sb = createServerClient()
    const { data, error } = await sb
      .from('persons')
      .select('id, full_name, hebrew_name, email, phones, gender, birth_date, photo_url, address, marital_status, nationality, passport_number')
      .eq('id', params.id)
      .single()

    if (error) throw error

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = data as any
    const phones: unknown[] = Array.isArray(p.phones) ? p.phones : []
    return NextResponse.json({
      id: p.id,
      full_name: p.full_name,
      hebrew_name: p.hebrew_name ?? null,
      email: p.email ?? null,
      phone: phones.length > 0 ? ((phones[0] as { number?: string })?.number ?? phones[0]) : null,
      phones: phones,
      gender: p.gender ?? null,
      birth_date: p.birth_date ?? null,
      photo_url: p.photo_url ?? null,
      address: p.address ?? null,
      marital_status: p.marital_status ?? null,
      citizenship: p.nationality ?? null,
      passport_number: p.passport_number ?? null,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
