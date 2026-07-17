import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireFinancePrivilege, hasFinancePrivilege } from '@/lib/finance/permissions'
import { toCents, centsToNumber } from '@/lib/finance/money'
import { mapDbError } from '@/lib/finance/http'

/**
 * GET /api/finance/students
 *
 * Список студентов (education_journeys со статусом 'student'), присоединённых
 * к persons, с ВЫЧИСЛЯЕМЫМ балансом. Баланс не хранится:
 *   balance = Σ(finance_charges.amount WHERE status='active')
 *           − Σ(finance_payments.amount WHERE status='approved')
 * Считается пакетно (два запроса .in(journey_id), без N+1), в целых копейках.
 *
 * Право: finance.view.
 *
 * Фильтры:
 *   ?search=...  — app-side по persons.full_name/hebrew_name/email/phones
 *
 * Ответ: { students: FinanceStudentListItem[] }
 */

const PERSON_SELECT =
  'id, full_name, hebrew_name, email, phones, photo_url'

function flattenPhones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(p => (typeof p === 'string' ? p : (p as { number?: string })?.number ?? ''))
    .filter(Boolean)
}

// Размер страницы для агрегации баланса. PostgREST по умолчанию отдаёт не
// более db-max-rows (обычно 1000) строк за запрос и МОЛЧА обрезает остальное.
// Запросы ниже возвращают строку НА КАЖДОЕ начисление/платёж (не на студента),
// поэтому при масштабе (сотни студентов) единый .in(...) обрезался бы и давал
// неверный баланс. Читаем страницами по PAGE и суммируем в копейках.
const PAGE = 1000

/**
 * Суммирует amount (в копейках) по journey_id для одного статуса, вычитывая
 * ВСЕ строки постранично (устойчиво к db-max-rows). Возвращает Map journey→копейки.
 */
async function sumCentsByJourney(
  sb: ReturnType<typeof createServerClient>,
  table: 'finance_charges' | 'finance_payments',
  journeyIds: string[],
  status: 'active' | 'cancelled' | 'pending' | 'approved',
): Promise<Map<string, number>> {
  const acc = new Map<string, number>()
  if (journeyIds.length === 0) return acc

  let from = 0
  for (;;) {
    const { data, error } = await sb
      .from(table)
      .select('journey_id, amount')
      .in('journey_id', journeyIds)
      .eq('status', status)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error

    const rows = data ?? []
    for (const r of rows) {
      acc.set(r.journey_id, (acc.get(r.journey_id) ?? 0) + toCents(r.amount))
    }
    if (rows.length < PAGE) break
    from += PAGE
  }
  return acc
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireFinancePrivilege('view')
    const canCharge = await hasFinancePrivilege(session, 'create_invoice')

    const sb = createServerClient()

    // Список студентов читаем постранично: единый select без .range() молча
    // обрезался бы на db-max-rows (~1000), теряя студентов из списка И из
    // агрегации баланса (journeyIds строится из этих строк). Тот же приём, что
    // sumCentsByJourney ниже; вторичная сортировка по id — стабильная пагинация.
    type JourneyRow = { id: string; person_id: string; opened_at: string; person: unknown }
    const rows: JourneyRow[] = []
    let jFrom = 0
    for (;;) {
      const { data, error } = await sb
        .from('education_journeys')
        .select(`
          id, person_id, opened_at,
          person:persons!applicant_profiles_person_id_fkey(${PERSON_SELECT})
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
    const journeyIds = rows.map(j => j.id)

    // Баланс пакетно (без N+1, без float-дрейфа): активные начисления и
    // подтверждённые платежи, каждое — постранично, чтобы не обрезаться на
    // db-max-rows. Суммируем по journey_id в копейках.
    const chargeCents = await sumCentsByJourney(sb, 'finance_charges', journeyIds, 'active')
    const payCents = await sumCentsByJourney(sb, 'finance_payments', journeyIds, 'approved')

    let students = rows.map(j => {
      const person = j.person as {
        id?: string
        full_name?: string | null
        hebrew_name?: string | null
        email?: string | null
        phones?: unknown
        photo_url?: string | null
      } | null
      const charged = chargeCents.get(j.id) ?? 0
      const paid = payCents.get(j.id) ?? 0
      return {
        journey_id: j.id,
        person_id: person?.id ?? j.person_id,
        full_name: person?.full_name ?? '',
        hebrew_name: person?.hebrew_name ?? null,
        email: person?.email ?? null,
        phones: flattenPhones(person?.phones),
        photo_url: person?.photo_url ?? null,
        charges_total: centsToNumber(charged),
        payments_total: centsToNumber(paid),
        balance: centsToNumber(charged - paid),
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

    return NextResponse.json({ students, can_charge: canCharge })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
