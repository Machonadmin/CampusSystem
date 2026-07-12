import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requirePersonsPrivilege } from '@/lib/persons/permissions'
import { mapDbError } from '@/lib/persons/http'

/**
 * GET /api/persons/students
 *
 * ЧИТАЮЩИЙ справочник студентов: education_journeys со статусом 'student',
 * присоединённые к persons и к primary_department. Тот же join, что в
 * /api/finance/students и /api/alumni (persons через FK
 * applicant_profiles_person_id_fkey, департамент — через
 * education_journeys_primary_department_id_fkey).
 *
 * Право: persons.view. Модуль НЕ владеет таблицами — только читает.
 *
 * Фильтры:
 *   ?search=...  — app-side по full_name/hebrew_name/email/phones
 *
 * Пагинация (app-side, после поиска):
 *   ?page=1&pageSize=50
 *
 * Ответ: { students: PersonsStudentItem[], total, page, pageSize }
 */

// PostgREST молча обрезает выдачу на db-max-rows (~1000). Студенты копятся по
// когортам и легко превысят 1000 — читаем journeys постранично.
const PAGE = 1000
const DEFAULT_PAGE_SIZE = 50

function flattenPhones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(p => (typeof p === 'string' ? p : (p as { number?: string })?.number ?? ''))
    .filter(Boolean)
}

export async function GET(request: NextRequest) {
  try {
    await requirePersonsPrivilege('view')

    const sb = createServerClient()

    type JourneyRow = {
      id: string
      person_id: string
      education_status: string | null
      opened_at: string | null
      person: unknown
      primary_department: unknown
    }
    const rows: JourneyRow[] = []
    let jFrom = 0
    for (;;) {
      const { data, error } = await sb
        .from('education_journeys')
        .select(`
          id, person_id, education_status, opened_at,
          person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name, email, phones, photo_url),
          primary_department:departments!education_journeys_primary_department_id_fkey(id, name)
        `)
        .eq('education_status', 'student')
        .order('opened_at', { ascending: false })
        .order('id', { ascending: true })
        .range(jFrom, jFrom + PAGE - 1)
      if (error) throw error
      const page = (data ?? []) as JourneyRow[]
      rows.push(...page)
      if (page.length < PAGE) break
      jFrom += PAGE
    }

    let students = rows.map(j => {
      const person = j.person as {
        id?: string
        full_name?: string | null
        hebrew_name?: string | null
        email?: string | null
        phones?: unknown
        photo_url?: string | null
      } | null
      const dept = j.primary_department as { name?: string | null } | null
      return {
        journey_id: j.id,
        person_id: person?.id ?? j.person_id,
        full_name: person?.full_name ?? '',
        hebrew_name: person?.hebrew_name ?? null,
        education_status: j.education_status ?? 'student',
        department: dept?.name ?? null,
        email: person?.email ?? null,
        phones: flattenPhones(person?.phones),
        photo_url: person?.photo_url ?? null,
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

    students.sort((a, b) => a.full_name.localeCompare(b.full_name))

    const total = students.length
    const page = Math.max(1, Number(request.nextUrl.searchParams.get('page')) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(request.nextUrl.searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE))
    const start = (page - 1) * pageSize
    const pageItems = students.slice(start, start + pageSize)

    return NextResponse.json({ students: pageItems, total, page, pageSize })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
