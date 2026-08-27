import { createServerClient } from '@/lib/supabase/server'

type SB = ReturnType<typeof createServerClient>

/**
 * Владелец: доноры и контакты — РАЗНЫЕ модули (не каждый контакт — донор), но
 * реквизиты каждого донора (имя, телефон, e-mail) должны сохраняться и в
 * справочнике контактов. Синхронизация в одну сторону: донор → контакт с
 * category='financial'. Ищем контакт по точному имени в этой категории:
 * есть — обновляем телефон/почту, нет — создаём.
 *
 * Best-effort: НИКОГДА не бросает — сбой синхронизации не должен ломать
 * создание/правку донора.
 */
export async function syncSponsorToContacts(
  sb: SB,
  sponsor: {
    name: string
    email: string | null
    phone: string | null
    sponsor_type?: string | null
    created_by?: string | null
  },
): Promise<void> {
  try {
    const name = sponsor.name.trim()
    if (!name) return

    const contactType = sponsor.sponsor_type === 'individual' ? 'person' : 'organization'

    const { data: existing, error: findErr } = await sb
      .from('contacts')
      .select('id, email, phone')
      .eq('category', 'financial')
      .eq('name', name)
      .limit(1)
    if (findErr) return

    const row = (existing ?? [])[0]
    if (row) {
      const patch: Record<string, unknown> = {}
      if (sponsor.email && sponsor.email !== row.email) patch.email = sponsor.email
      if (sponsor.phone && sponsor.phone !== row.phone) patch.phone = sponsor.phone
      if (Object.keys(patch).length === 0) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: _updErr } = await sb.from('contacts').update(patch as any).eq('id', row.id)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: _insErr } = await sb.from('contacts').insert({
      name,
      contact_type: contactType,
      category: 'financial',
      email: sponsor.email ?? null,
      phone: sponsor.phone ?? null,
      created_by: sponsor.created_by ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
  } catch {
    // best-effort — молча
  }
}
