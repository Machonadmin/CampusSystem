import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireDocumentsPrivilege } from '@/lib/documents/permissions'
import { mapDbError } from '@/lib/documents/http'
import { documentSummariesByJourney, todayISO } from '@/lib/documents/records-server'

/**
 * GET /api/documents/students — студенты (education_journeys status='student') с
 *   persons, числом документов и флагами has_expired / has_expiring_soon (по
 *   активным документам, чистые хелперы isExpired/isExpiringSoon). Право:
 *   documents.view. Фильтр ?search= — app-side по ФИО/email/телефонам (как в
 *   остальных модулях).
 */

const PAGE = 1000

function flattenPhones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(p => (typeof p === 'string' ? p : (p as { number?: string })?.number ?? ''))
    .filter(Boolean)
}

export async function GET(request: NextRequest) {
  try {
    await requireDocumentsPrivilege('view')

    const sb = createServerClient()

    // Все студенты (постранично на случай большого набора).
    const journeys: { id: string; person_id: string; person: unknown }[] = []
    let offset = 0
    for (;;) {
      const { data, error } = await sb
        .from('education_journeys')
        .select(`
          id, person_id, opened_at,
          person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name, email, phones, photo_url)
        `)
        .eq('education_status', 'student')
        .order('opened_at', { ascending: false })
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      const batch = data ?? []
      journeys.push(...(batch as unknown as { id: string; person_id: string; person: unknown }[]))
      if (batch.length < PAGE) break
      offset += PAGE
    }

    const journeyIds = journeys.map(j => j.id)
    const today = todayISO()
    const summaries = await documentSummariesByJourney(sb, journeyIds, today)

    let students = journeys.map(j => {
      const person = j.person as {
        id?: string
        full_name?: string | null
        hebrew_name?: string | null
        email?: string | null
        phones?: unknown
        photo_url?: string | null
      } | null
      const s = summaries.get(j.id)
      return {
        journey_id: j.id,
        person_id: person?.id ?? j.person_id,
        full_name: person?.full_name ?? '',
        hebrew_name: person?.hebrew_name ?? null,
        email: person?.email ?? null,
        phones: flattenPhones(person?.phones),
        photo_url: person?.photo_url ?? null,
        doc_count: s?.count ?? 0,
        has_expired: s?.has_expired ?? false,
        has_expiring_soon: s?.has_expiring_soon ?? false,
      }
    })

    const search = request.nextUrl.searchParams.get('search')?.trim().toLowerCase()
    if (search) {
      students = students.filter(s =>
        s.full_name.toLowerCase().includes(search) ||
        (s.hebrew_name ?? '').toLowerCase().includes(search) ||
        (s.email ?? '').toLowerCase().includes(search) ||
        s.phones.join(' ').toLowerCase().includes(search)
      )
    }

    return NextResponse.json({ students })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
