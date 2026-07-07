import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireDormitoryPrivilege } from '@/lib/dormitory/permissions'
import { mapDbError } from '@/lib/dormitory/http'
import { isActiveOn, type Assignment } from '@/lib/dormitory/occupancy'
import { todayISO } from '@/lib/dormitory/occupancy-server'

/**
 * GET /api/dormitory/students — студенты (education_journeys status='student')
 *   с persons и ТЕКУЩЕЙ комнатой (или null — не заселён). Право: dormitory.view.
 *   Фильтр ?search= — app-side по ФИО/email/телефонам (как в других модулях).
 *   Используется поисковым пикером при назначении студента в комнату.
 */

const PAGE = 1000

function flattenPhones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(p => (typeof p === 'string' ? p : (p as { number?: string })?.number ?? ''))
    .filter(Boolean)
}

interface CurrentRoom { room_number: string | null; building_name: string | null }

export async function GET(request: NextRequest) {
  try {
    await requireDormitoryPrivilege('view')

    const sb = createServerClient()

    const { data: journeys, error } = await sb
      .from('education_journeys')
      .select(`
        id, person_id, opened_at,
        person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name, email, phones, photo_url)
      `)
      .eq('education_status', 'student')
      .order('opened_at', { ascending: false })
    if (error) throw error

    const rows = journeys ?? []
    const journeyIds = rows.map(j => j.id)

    // Текущая комната каждого студента: активные назначения (постранично),
    // отфильтрованные «активно на сегодня», сгруппированные по journey_id.
    const today = todayISO()
    const roomByJourney = new Map<string, CurrentRoom>()
    if (journeyIds.length > 0) {
      let offset = 0
      for (;;) {
        const { data, error: aErr } = await sb
          .from('dorm_assignments')
          .select(`
            journey_id, assigned_from, assigned_to, status,
            room:dorm_rooms!dorm_assignments_room_id_fkey(
              room_number, building:dorm_buildings!dorm_rooms_building_id_fkey(name)
            )
          `)
          .in('journey_id', journeyIds)
          .eq('status', 'active')
          .order('id', { ascending: true })
          .range(offset, offset + PAGE - 1)
        if (aErr) throw aErr
        const arows = data ?? []
        for (const a of arows) {
          if (roomByJourney.has(a.journey_id)) continue
          const active = isActiveOn(
            { assigned_from: a.assigned_from, assigned_to: a.assigned_to, status: a.status } as Assignment,
            today,
          )
          if (!active) continue
          const room = a.room as { room_number?: string | null; building?: { name?: string | null } | null } | null
          roomByJourney.set(a.journey_id, {
            room_number: room?.room_number ?? null,
            building_name: room?.building?.name ?? null,
          })
        }
        if (arows.length < PAGE) break
        offset += PAGE
      }
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
      return {
        journey_id: j.id,
        person_id: person?.id ?? j.person_id,
        full_name: person?.full_name ?? '',
        hebrew_name: person?.hebrew_name ?? null,
        email: person?.email ?? null,
        phones: flattenPhones(person?.phones),
        photo_url: person?.photo_url ?? null,
        room: roomByJourney.get(j.id) ?? null,
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
