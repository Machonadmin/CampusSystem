import { createServerClient } from '@/lib/supabase/server'

type SB = ReturnType<typeof createServerClient>

/**
 * Создание «голой» персоны одним insert — общий путь для POST /api/persons
 * (быстрое добавление) и авто-создания персоны при связывании контакта/донора
 * (решение №11, lib/persons/record-link.ts).
 *
 * persons строго требует только first_name (NOT NULL); full_name — GENERATED
 * из last/first/middle. Телефон кладётся в phones JSONB как
 * [{ type: 'mobile', number }] — тот же формат, что и в быстром добавлении.
 */
export interface BarePersonInput {
  first_name: string
  last_name?: string | null
  middle_name?: string | null
  email?: string | null
  phone?: string | null
}

export async function insertBarePerson(sb: SB, input: BarePersonInput) {
  const phone = input.phone?.trim()
  const phones = phone ? [{ type: 'mobile', number: phone }] : []
  return sb
    .from('persons')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      last_name: input.last_name ?? null,
      first_name: input.first_name,
      middle_name: input.middle_name ?? null,
      email: input.email?.trim() || null,
      phones,
    } as any)
    .select('id, full_name, email')
    .single()
}
