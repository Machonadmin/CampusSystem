import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasAlumniPrivilege } from '@/lib/alumni/permissions'

/**
 * GET /api/alumni
 *
 * Список выпускников: education_journeys со статусом 'graduated', присоединённые
 * к persons, дополненные полями alumni_profiles (по person_id).
 *
 * Право: alumni.view.
 *
 * Фильтры:
 *   ?search=...  — app-side по persons.full_name/hebrew_name/email/phones
 *
 * Ответ: { alumni: AlumniListItem[] }
 */

function flattenPhones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(p => (typeof p === 'string' ? p : (p as { number?: string })?.number ?? ''))
    .filter(Boolean)
}

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '22P02') return { status: 400, message: 'Неверное значение поля' }
  return { status: 500, message: error.message ?? 'Ошибка БД' }
}

// PostgREST молча обрезает выдачу на db-max-rows (~1000). Выпускники копятся по
// всем когортам годами и легко превысят 1000, поэтому и список journeys, и
// добор профилей по person_id читаем/чанкуем постранично.
const PAGE = 1000

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const canView = await hasAlumniPrivilege(session, 'view')
    if (!canView) {
      return NextResponse.json({ error: 'Нет прав на просмотр' }, { status: 403 })
    }

    const sb = createServerClient()

    type JourneyRow = {
      id: string
      person_id: string
      opened_at: string | null
      person: unknown
      primary_department: unknown
      specialty: unknown
    }
    const rows: JourneyRow[] = []
    let jOffset = 0
    for (;;) {
      const { data, error } = await sb
        .from('education_journeys')
        .select(`
          id, person_id, opened_at,
          person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name, email, phones, photo_url),
          primary_department:departments!education_journeys_primary_department_id_fkey(id, name),
          specialty:specialties!education_journeys_specialty_id_fkey(id, name)
        `)
        .eq('education_status', 'graduated')
        .order('opened_at', { ascending: false })
        .order('id', { ascending: true })
        .range(jOffset, jOffset + PAGE - 1)
      if (error) throw error
      const page = (data ?? []) as JourneyRow[]
      rows.push(...page)
      if (page.length < PAGE) break
      jOffset += PAGE
    }
    const personIds = Array.from(
      new Set(rows.map(j => (j.person as { id?: string } | null)?.id ?? j.person_id).filter(Boolean))
    ) as string[]

    // Профили выпускников (наполняются RPC при выпуске) — по person_id.
    const profileMap = new Map<string, {
      id: string
      graduation_year: number | null
      institution: string | null
      direction: string | null
      current_location: string | null
      current_occupation: string | null
      notes: string | null
    }>()
    // Чанкуем personIds по PAGE: единый .in() сверх ~1000 id молча обрезался бы
    // на db-max-rows (часть выпускников осталась бы без профиля) и раздувал URL.
    for (let i = 0; i < personIds.length; i += PAGE) {
      const batch = personIds.slice(i, i + PAGE)
      const { data: profiles, error: profErr } = await sb
        .from('alumni_profiles')
        .select('id, person_id, graduation_year, institution, direction, current_location, current_occupation, notes')
        .in('person_id', batch)
      if (profErr) throw profErr
      for (const p of profiles ?? []) {
        profileMap.set(p.person_id, {
          id: p.id,
          graduation_year: p.graduation_year,
          institution: p.institution,
          direction: p.direction,
          current_location: p.current_location,
          current_occupation: p.current_occupation,
          notes: p.notes,
        })
      }
    }

    let alumni = rows.map(j => {
      const person = j.person as {
        id?: string
        full_name?: string | null
        hebrew_name?: string | null
        email?: string | null
        phones?: unknown
        photo_url?: string | null
      } | null
      const pid = person?.id ?? j.person_id
      const profile = pid ? profileMap.get(pid) ?? null : null
      const dept = j.primary_department as { name?: string | null } | null
      const spec = j.specialty as { name?: string | null } | null
      return {
        journey_id: j.id,
        person_id: pid,
        full_name: person?.full_name ?? '',
        hebrew_name: person?.hebrew_name ?? null,
        email: person?.email ?? null,
        phones: flattenPhones(person?.phones),
        photo_url: person?.photo_url ?? null,
        alumni_profile_id: profile?.id ?? null,
        // Приоритет — сохранённый профиль; иначе разворачиваем из journey.
        graduation_year: profile?.graduation_year ?? null,
        institution: profile?.institution ?? dept?.name ?? null,
        direction: profile?.direction ?? spec?.name ?? null,
        current_location: profile?.current_location ?? null,
        current_occupation: profile?.current_occupation ?? null,
        notes: profile?.notes ?? null,
      }
    })

    const search = request.nextUrl.searchParams.get('search')?.trim().toLowerCase()
    if (search) {
      alumni = alumni.filter(a =>
        a.full_name.toLowerCase().includes(search) ||
        (a.hebrew_name ?? '').toLowerCase().includes(search) ||
        (a.email ?? '').toLowerCase().includes(search) ||
        a.phones.join(' ').toLowerCase().includes(search)
      )
    }

    return NextResponse.json({ alumni })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
