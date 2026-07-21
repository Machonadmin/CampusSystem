import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { serverT } from '@/lib/i18n/api-errors'
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
      .select('id, full_name, last_name, first_name, middle_name, hebrew_name, email, phones, gender, birth_date, photo_url, address, marital_status, nationality, passport_number')
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
      last_name: p.last_name ?? null,
      first_name: p.first_name ?? null,
      middle_name: p.middle_name ?? null,
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
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

// Обновляемые поля персоны. full_name — ГЕНЕРИРУЕМАЯ колонка, её НЕ трогаем
// (собирается из частей имени). Телефоны приводим к канонической форме
// [{type, number}] как во всём приложении.
const patchSchema = z.object({
  last_name: z.string().trim().nullish(),
  first_name: z.string().trim().nullish(),
  middle_name: z.string().trim().nullish(),
  hebrew_name: z.string().trim().nullish(),
  gender: z.enum(['male', 'female', 'other']).nullish(),
  email: z.string().trim().nullish(),
  phones: z.array(z.string().trim()).optional(),
  birth_date: z.string().nullish(),
  marital_status: z.string().nullish(),
  citizenship: z.string().nullish(),
  address: z.record(z.string(), z.string()).nullish(),
}).partial()

/**
 * PATCH /api/persons/[id] — обновляет базовые поля персоны (для «редактирования»
 * сотрудника в кадрах и т.п.). Право: persons.edit. Чувствительные PII
 * (дата рождения, адрес, гражданство, сем.положение) обновляются ТОЛЬКО при
 * наличии persons.view_sensitive — иначе эти поля из payload игнорируются
 * (не затираем). Обновляем лишь переданные ключи.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requirePrivilege('persons', 'edit')

    const raw = await request.json().catch(() => ({}))
    const parsed = patchSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: serverT('generic_error') }, { status: 400 })
    }
    const body = parsed.data

    const norm = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null)
    const update: Record<string, unknown> = {}
    if (body.last_name !== undefined) update.last_name = norm(body.last_name)
    if (body.first_name !== undefined) update.first_name = norm(body.first_name)
    if (body.middle_name !== undefined) update.middle_name = norm(body.middle_name)
    if (body.hebrew_name !== undefined) update.hebrew_name = norm(body.hebrew_name)
    if (body.gender !== undefined) update.gender = body.gender ?? null
    if (body.email !== undefined) update.email = norm(body.email)
    if (body.phones !== undefined) {
      update.phones = body.phones.filter(p => p.trim()).map(number => ({ type: 'mobile', number: number.trim() }))
    }

    // Чувствительные поля — только с view_sensitive.
    if (await hasPersonsPrivilege(session, 'view_sensitive')) {
      if (body.birth_date !== undefined) update.birth_date = body.birth_date || null
      if (body.marital_status !== undefined) update.marital_status = norm(body.marital_status)
      if (body.citizenship !== undefined) update.nationality = norm(body.citizenship)
      if (body.address !== undefined) update.address = body.address ?? {}
    }

    if (Object.keys(update).length === 0) return NextResponse.json({ ok: true })

    const sb = createServerClient()
    const { error } = await (sb as unknown as SupabaseClient)
      .from('persons').update(update).eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
