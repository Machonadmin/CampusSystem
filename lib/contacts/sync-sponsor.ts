import { createServerClient } from '@/lib/supabase/server'

type SB = ReturnType<typeof createServerClient>

/**
 * Владелец: доноры и контакты — РАЗНЫЕ модули (не каждый контакт — донор), но
 * реквизиты каждого донора (имя, телефон, e-mail) должны сохраняться и в
 * справочнике контактов. Синхронизация в одну сторону: донор → контакт с
 * category='financial'. Ищем контакт по точному имени в этой категории:
 * есть — обновляем телефон/почту, нет — создаём.
 *
 * Решение №11: если у донора есть sponsors.contact_id — контакт берётся ПО ID
 * (устойчиво к переименованию), откат — по точному имени, как раньше. Найденный
 * или созданный контакт запоминается в sponsors.contact_id. Деплой-безопасно:
 * пока колонки нет (42703/PGRST204) — работает только поиск по имени.
 *
 * Best-effort: НИКОГДА не бросает — сбой синхронизации не должен ломать
 * создание/правку донора.
 */
export async function syncSponsorToContacts(
  sb: SB,
  sponsor: {
    id?: string | null
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

    // 1) Связь по id (sponsors.contact_id), если она уже есть.
    let linkedContactId: string | null = null
    let contactIdColumn = false
    if (sponsor.id) {
      const { data: sp, error: spErr } = await sb
        .from('sponsors')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select('contact_id' as any)
        .eq('id', sponsor.id)
        .maybeSingle()
      // Ошибка (в т.ч. 42703/PGRST204 — колонки ещё нет) → работаем по имени,
      // связь не запоминаем.
      if (!spErr) {
        contactIdColumn = true
        linkedContactId = ((sp as { contact_id?: string | null } | null)?.contact_id) ?? null
      }
    }

    let row: { id: string; email: string | null; phone: string | null } | undefined
    if (linkedContactId) {
      const { data: byId, error: byIdErr } = await sb
        .from('contacts')
        .select('id, email, phone')
        .eq('id', linkedContactId)
        .maybeSingle()
      if (!byIdErr && byId) row = byId as { id: string; email: string | null; phone: string | null }
    }

    // 2) Откат — по точному имени в category='financial'.
    if (!row) {
      const { data: existing, error: findErr } = await sb
        .from('contacts')
        .select('id, email, phone')
        .eq('category', 'financial')
        .eq('name', name)
        .limit(1)
      if (findErr) return
      row = (existing ?? [])[0]
    }

    let contactId: string | null = null
    if (row) {
      contactId = row.id
      const patch: Record<string, unknown> = {}
      if (sponsor.email && sponsor.email !== row.email) patch.email = sponsor.email
      if (sponsor.phone && sponsor.phone !== row.phone) patch.phone = sponsor.phone
      if (Object.keys(patch).length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: _updErr } = await sb.from('contacts').update(patch as any).eq('id', row.id)
      }
    } else {
      const { data: created, error: insErr } = await sb.from('contacts').insert({
        name,
        contact_type: contactType,
        category: 'financial',
        email: sponsor.email ?? null,
        phone: sponsor.phone ?? null,
        created_by: sponsor.created_by ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).select('id').single()
      if (insErr || !created) return
      contactId = (created as { id: string }).id
    }

    // 3) Запомнить связь донор → контакт (только если колонка есть и связь изменилась).
    if (sponsor.id && contactIdColumn && contactId && contactId !== linkedContactId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: _linkErr } = await sb.from('sponsors').update({ contact_id: contactId } as any).eq('id', sponsor.id)
    }
  } catch {
    // best-effort — молча
  }
}
