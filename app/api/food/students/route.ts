import { flattenPhones } from '@/lib/persons/phone'
import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireFoodPrivilege } from '@/lib/food/permissions'
import { mapDbError } from '@/lib/food/http'
import { isActiveOn, type Enrollment } from '@/lib/food/enrollment'
import { todayISO } from '@/lib/food/enrollment-server'

/**
 * GET /api/food/students — студенты (education_journeys status='student') с
 *   persons и ТЕКУЩИМ планом питания (или null — без плана). Право: food.view.
 *   Фильтр ?search= — app-side по ФИО/email/телефонам (как в других модулях).
 *   Используется поисковым пикером при записи студента на план.
 */

const PAGE = 1000


interface CurrentPlan { plan_id: string | null; plan_name: string | null }

export async function GET(request: NextRequest) {
  try {
    await requireFoodPrivilege('view')

    const sb = createServerClient()

    // Список студентов читаем постранично: единый select без .range() молча
    // обрезался бы на db-max-rows (~1000), и студенты сверх 1000 никогда бы не
    // попали в пикер записи на план и в поиск. Вторичная сортировка по id даёт
    // стабильную пагинацию (как в цикле meal_enrollments ниже).
    type JourneyRow = { id: string; person_id: string; opened_at: string | null; person: unknown }
    const rows: JourneyRow[] = []
    let jOffset = 0
    for (;;) {
      const { data, error } = await sb
        .from('education_journeys')
        .select(`
          id, person_id, opened_at,
          person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name, email, phones, photo_url)
        `)
        .eq('education_status', 'student')
        .order('opened_at', { ascending: false })
        .order('id', { ascending: true })
        .range(jOffset, jOffset + PAGE - 1)
      if (error) throw error
      const page = (data ?? []) as JourneyRow[]
      rows.push(...page)
      if (page.length < PAGE) break
      jOffset += PAGE
    }
    const journeyIds = rows.map(j => j.id)

    // Текущий план каждого студента: активные записи (постранично),
    // отфильтрованные «активно на сегодня», сгруппированные по journey_id.
    const today = todayISO()
    const planByJourney = new Map<string, CurrentPlan>()
    if (journeyIds.length > 0) {
      let offset = 0
      for (;;) {
        const { data, error: eErr } = await sb
          .from('meal_enrollments')
          .select(`
            journey_id, enrolled_from, enrolled_to, status,
            plan:meal_plans!meal_enrollments_meal_plan_id_fkey(id, name)
          `)
          .in('journey_id', journeyIds)
          .eq('status', 'active')
          .order('id', { ascending: true })
          .range(offset, offset + PAGE - 1)
        if (eErr) throw eErr
        const erows = data ?? []
        for (const en of erows) {
          if (planByJourney.has(en.journey_id)) continue
          const active = isActiveOn(
            { enrolled_from: en.enrolled_from, enrolled_to: en.enrolled_to, status: en.status } as Enrollment,
            today,
          )
          if (!active) continue
          const plan = en.plan as { id?: string | null; name?: string | null } | null
          planByJourney.set(en.journey_id, {
            plan_id: plan?.id ?? null,
            plan_name: plan?.name ?? null,
          })
        }
        if (erows.length < PAGE) break
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
        plan: planByJourney.get(j.id) ?? null,
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
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
