import { NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'

/**
 * GET /api/education/recruitment-report — READ-ONLY.
 *
 * Дашборд набора (דוחות גיוס): агрегаты по лидам education_journeys —
 * всего лидов, разбивки по источнику / этапу / возрасту / географии, воронка
 * конверсии (лиды → абитуриентки → студентки) и новые лиды по месяцам.
 *
 * Право: education `view_leads` (canDoEducationInAny — superadmin bypass внутри).
 * НЕ reports.view (это management-only академический отчёт).
 *
 * Deploy-safe: любой read обёрнут; при 42P01 (undefined_table) / 42703
 * (undefined_column) возвращаем пустые структуры, а не 500.
 */

// Коды PostgREST, при которых мягко деградируем до пустого результата.
const SOFT_CODES = new Set(['42P01', '42703'])
function isSoft(err: unknown): boolean {
  return !!err && SOFT_CODES.has((err as { code?: string }).code ?? '')
}

// education_status, которые «дошли» дальше лида (статус кумулятивен: студентка
// когда-то была лидом). Зеркалит admission-funnel.
const BEYOND_LEAD = ['applicant', 'student', 'on_leave', 'graduated', 'expelled']
const BEYOND_APPLICANT = ['student', 'on_leave', 'graduated', 'expelled']

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 1000) / 10
}

type LeadJourney = {
  id: string
  person_id: string
  referral_source: string | null
  application_date: string | null
  opened_at: string | null
  recruitment_stage?: string | null
}

type PersonGeo = {
  id: string
  birth_date: string | null
  address: unknown
}

/** Возраст в полных годах на сегодня; null если дата некорректна. */
function ageFromBirth(birth: string | null): number | null {
  if (!birth) return null
  const d = new Date(birth)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  if (age < 0 || age > 130) return null
  return age
}

function ageBucket(age: number | null): string {
  if (age === null) return 'unknown'
  if (age < 18) return '<18'
  if (age <= 20) return '18-20'
  if (age <= 25) return '21-25'
  if (age <= 30) return '26-30'
  return '31+'
}

/**
 * Достаёт страну/город из persons.address (JSONB). В этой БД у persons НЕТ
 * отдельных колонок country/city — география живёт в address ({ city, country }).
 * Значения нормализуем (trim); отсутствующие → null.
 */
function geoFromAddress(address: unknown): { country: string | null; city: string | null } {
  if (!address || typeof address !== 'object') return { country: null, city: null }
  const a = address as Record<string, unknown>
  const norm = (v: unknown): string | null => {
    if (typeof v !== 'string') return null
    const t = v.trim()
    return t.length > 0 ? t : null
  }
  return { country: norm(a.country), city: norm(a.city) }
}

export async function GET() {
  const empty = {
    total_leads: 0,
    by_source: [] as Array<{ source: string; count: number }>,
    by_stage: [] as Array<{ stage: string; count: number }>,
    by_age: [] as Array<{ bucket: string; count: number }>,
    by_country: [] as Array<{ country: string; count: number }>,
    by_city: [] as Array<{ city: string; count: number }>,
    conversion: { leads: 0, applicants: 0, students: 0, lead_to_applicant: 0, applicant_to_student: 0 },
    by_month: [] as Array<{ month: string; count: number }>,
  }

  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const ok = await canDoEducationInAny(session, 'view_leads')
    if (!ok) return apiError('forbidden', 403)

    const sb = createServerClient()

    // ─── 1. Все journeys (срез по статусу для воронки) ────────────────────
    // Читаем один раз id+status, живые (не soft-deleted). При отсутствии
    // таблицы/колонки — пустая воронка.
    const statusRes = await sb
      .from('education_journeys')
      .select('education_status, is_deleted')
      .eq('is_deleted', false)
    if (statusRes.error && !isSoft(statusRes.error)) throw statusRes.error

    const byStatus: Record<string, number> = {}
    for (const r of (statusRes.data ?? []) as Array<{ education_status: string | null }>) {
      const s = r.education_status ?? 'unknown'
      byStatus[s] = (byStatus[s] ?? 0) + 1
    }
    const leads = byStatus['lead'] ?? 0
    const reachedApplicant = BEYOND_LEAD.reduce((s, k) => s + (byStatus[k] ?? 0), 0)
    const reachedStudent = BEYOND_APPLICANT.reduce((s, k) => s + (byStatus[k] ?? 0), 0)
    const everLead = leads + reachedApplicant
    const conversion = {
      leads,
      applicants: byStatus['applicant'] ?? 0,
      students: byStatus['student'] ?? 0,
      lead_to_applicant: pct(reachedApplicant, everLead),
      applicant_to_student: pct(reachedStudent, reachedApplicant),
    }

    // ─── 2. Лиды с полями для разбивок ────────────────────────────────────
    // recruitment_stage может отсутствовать на свежей БД (42703) — тогда
    // повторяем select без неё и не строим by_stage.
    const baseCols = 'id, person_id, referral_source, application_date, opened_at'
    // cols передаём строкой (не литералом): recruitment_stage может отсутствовать
    // в сгенерированных типах БД, и оба select() должны иметь один тип результата.
    const buildLeadQuery = (cols: string) => sb
      .from('education_journeys')
      .select(cols)
      .eq('education_status', 'lead')
      .eq('is_deleted', false)
    let stageAvailable = true
    let leadRes = await buildLeadQuery(`${baseCols}, recruitment_stage`)
    if (leadRes.error && (leadRes.error as { code?: string }).code === '42703') {
      stageAvailable = false
      leadRes = await buildLeadQuery(baseCols)
    }
    if (leadRes.error) {
      if (isSoft(leadRes.error)) return NextResponse.json({ ...empty, conversion })
      throw leadRes.error
    }
    const leadRows = (leadRes.data ?? []) as unknown as LeadJourney[]

    // ─── by_source ────────────────────────────────────────────────────────
    const sourceMap = new Map<string, number>()
    for (const j of leadRows) {
      const key = (j.referral_source && j.referral_source.trim()) || 'unknown'
      sourceMap.set(key, (sourceMap.get(key) ?? 0) + 1)
    }
    const by_source = [...sourceMap.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)

    // ─── by_stage (только если колонка есть) ──────────────────────────────
    let by_stage: Array<{ stage: string; count: number }> = []
    if (stageAvailable) {
      const stageMap = new Map<string, number>()
      for (const j of leadRows) {
        const key = (j.recruitment_stage && j.recruitment_stage.trim()) || 'unknown'
        stageMap.set(key, (stageMap.get(key) ?? 0) + 1)
      }
      by_stage = [...stageMap.entries()]
        .map(([stage, count]) => ({ stage, count }))
        .sort((a, b) => b.count - a.count)
    }

    // ─── by_month (по application_date, последние ~12 месяцев) ────────────
    const monthMap = new Map<string, number>()
    for (const j of leadRows) {
      const d = j.application_date ?? j.opened_at
      if (!d || d.length < 7) continue
      const month = d.slice(0, 7) // YYYY-MM
      monthMap.set(month, (monthMap.get(month) ?? 0) + 1)
    }
    const by_month = [...monthMap.entries()]
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)

    // ─── 3. persons (batch по person_id лидов) для возраста и географии ───
    const personIds = [...new Set(leadRows.map(j => j.person_id))]
    let persons: PersonGeo[] = []
    if (personIds.length > 0) {
      const pRes = await sb
        .from('persons')
        .select('id, birth_date, address')
        .in('id', personIds)
      if (pRes.error && !isSoft(pRes.error)) throw pRes.error
      persons = (pRes.data ?? []) as unknown as PersonGeo[]
    }
    const personMap = new Map(persons.map(p => [p.id, p]))

    // ─── by_age ───────────────────────────────────────────────────────────
    const ageOrder = ['<18', '18-20', '21-25', '26-30', '31+', 'unknown']
    const ageMap = new Map<string, number>()
    // ─── by_country / by_city ────────────────────────────────────────────
    const countryMap = new Map<string, number>()
    const cityMap = new Map<string, number>()
    for (const j of leadRows) {
      const p = personMap.get(j.person_id)
      const bucket = ageBucket(ageFromBirth(p?.birth_date ?? null))
      ageMap.set(bucket, (ageMap.get(bucket) ?? 0) + 1)

      const { country, city } = geoFromAddress(p?.address)
      const cKey = country ?? 'unknown'
      countryMap.set(cKey, (countryMap.get(cKey) ?? 0) + 1)
      const cityKey = city ?? 'unknown'
      cityMap.set(cityKey, (cityMap.get(cityKey) ?? 0) + 1)
    }
    const by_age = ageOrder
      .filter(b => ageMap.has(b))
      .map(bucket => ({ bucket, count: ageMap.get(bucket)! }))
    const by_country = [...countryMap.entries()]
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
    const by_city = [...cityMap.entries()]
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({
      total_leads: leadRows.length,
      by_source,
      by_stage,
      by_age,
      by_country,
      by_city,
      conversion,
      by_month,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    if (isSoft(err)) return NextResponse.json(empty)
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
