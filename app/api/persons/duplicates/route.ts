import { NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { normalizePersonName, normalizeEmail, normalizePassport, phoneMatchKeys } from '@/lib/persons/duplicate-match'

/**
 * GET /api/persons/duplicates
 * Находит кандидатов-дублей в מאגר אנשים: записи, совпадающие по
 *   • нормализованному имени (ФИО без регистра/лишних пробелов),
 *   • email,
 *   • номеру паспорта/ת.ז,
 *   • номеру телефона (только цифры).
 * Возвращает кластеры { reason, persons[] } — каждый кластер = 2+ записи,
 * которые, вероятно, один и тот же человек. Право: superadmin.
 */

interface Row {
  id: string
  first_name: string | null
  last_name: string | null
  middle_name: string | null
  full_name: string | null
  hebrew_name: string | null
  email: string | null
  passport_number: string | null
  phones: unknown
}

type Reason = 'name' | 'email' | 'passport' | 'phone'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!session.roles.includes('superadmin')) return apiError('forbidden', 403)

    const sb = createServerClient()
    const { data, error } = await sb
      .from('persons')
      .select('id, first_name, last_name, middle_name, full_name, hebrew_name, email, passport_number, phones')
      .limit(20000)
    if (error) throw error
    const rows = (data ?? []) as Row[]

    // key → { reason, ids }
    const buckets = new Map<string, { reason: Reason; ids: Set<string> }>()
    const add = (reason: Reason, key: string, id: string) => {
      if (!key) return
      const k = `${reason}:${key}`
      const b = buckets.get(k) ?? { reason, ids: new Set<string>() }
      b.ids.add(id)
      buckets.set(k, b)
    }
    for (const r of rows) {
      add('name', normalizePersonName(r), r.id)
      if (r.email) add('email', normalizeEmail(r.email), r.id)
      if (r.passport_number) add('passport', normalizePassport(r.passport_number), r.id)
      for (const ph of phoneMatchKeys(r.phones)) add('phone', ph, r.id)
    }

    const byId = new Map(rows.map(r => [r.id, r]))
    const display = (r: Row) => ({
      id: r.id,
      full_name: [r.last_name, r.first_name, r.middle_name].filter(Boolean).join(' ') || r.full_name || '—',
      hebrew_name: r.hebrew_name,
      email: r.email,
      passport_number: r.passport_number,
      phone: phoneMatchKeys(r.phones)[0] ?? null,
    })

    // Собираем кластеры; дедуплицируем по одинаковому набору участников+причине.
    const seen = new Set<string>()
    const clusters: { reason: Reason; persons: ReturnType<typeof display>[] }[] = []
    const reasonRank: Record<Reason, number> = { passport: 4, email: 3, phone: 2, name: 1 }
    for (const b of buckets.values()) {
      if (b.ids.size < 2) continue
      const ids = [...b.ids].sort()
      const sig = `${b.reason}|${ids.join(',')}`
      if (seen.has(sig)) continue
      seen.add(sig)
      clusters.push({ reason: b.reason, persons: ids.map(id => display(byId.get(id)!)) })
    }
    clusters.sort((a, z) => reasonRank[z.reason] - reasonRank[a.reason] || z.persons.length - a.persons.length)

    return NextResponse.json({ clusters })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
