import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requirePrivilege } from '@/lib/auth/module-privileges'
import { hasPersonsPrivilege } from '@/lib/persons/permissions'
import { redactSensitivePerson } from '@/lib/persons/redact'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requirePrivilege('persons', 'view')

    const sb = createServerClient()
    const { data, error } = await sb
      .from('persons')
      .select('id, full_name, hebrew_name, email, phones, gender, birth_date, photo_url, address, marital_status, nationality, passport_number')
      .eq('id', params.id)
      .single()

    if (error) throw error

    // Чувствительные PII-поля (паспорт/адрес/гражданство/сем.положение/дата
    // рождения) обнуляем, если у вызывающего нет 'persons.view_sensitive'.
    const canSeeSensitive = await hasPersonsPrivilege(session, 'view_sensitive')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = redactSensitivePerson(data as Record<string, unknown>, canSeeSensitive) as any
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
