import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { hasFinancePrivilege } from '@/lib/finance/permissions'
import { hasDormitoryPrivilege } from '@/lib/dormitory/permissions'
import { hasFoodPrivilege } from '@/lib/food/permissions'
import { hasDoctorPrivilege } from '@/lib/doctor/permissions'
import { hasPsychologistPrivilege } from '@/lib/psychologist/permissions'
import { hasDocumentsPrivilege } from '@/lib/documents/permissions'
import { pageAll } from '@/lib/reports/paging'
import { toCents, centsToNumber } from '@/lib/finance/money'
import { isActiveOn as isDormActiveOn } from '@/lib/dormitory/occupancy'
import { isActiveOn as isFoodActiveOn } from '@/lib/food/enrollment'
import { documentStats } from '@/lib/documents/expiry'
import {
  visibleSections,
  pickCurrentActive,
  flattenPhones,
  hasAllergies,
  type StudentOverview,
  type OverviewFinance,
  type OverviewDormitory,
  type OverviewFood,
  type OverviewMedical,
  type OverviewCounseling,
  type OverviewDocuments,
} from '@/lib/students/overview'

type Sb = ReturnType<typeof createServerClient>

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '22P02') return { status: 400, message: 'Неверный идентификатор' }
  if (error.code === '23503') return { status: 400, message: 'Ссылка на несуществующую запись' }
  return { status: 500, message: error.message ?? 'Ошибка БД' }
}

// ─── Загрузчики секций (вызываются ТОЛЬКО при наличии привилегии 'view') ───────
//
// Каждый возвращает данные секции или null, если у студента нет данных в модуле.
// Ошибки БД пробрасываются и маппятся в catch роута.

/** Финансы: Σ active charges − Σ approved payments, суммы в целых копейках. */
async function loadFinance(sb: Sb, journeyId: string): Promise<OverviewFinance | null> {
  const chargeRows = await pageAll<{ amount: number | string }>((from, to) =>
    sb
      .from('finance_charges')
      .select('amount')
      .eq('journey_id', journeyId)
      .eq('status', 'active')
      .order('id', { ascending: true })
      .range(from, to),
  )
  const payRows = await pageAll<{ amount: number | string }>((from, to) =>
    sb
      .from('finance_payments')
      .select('amount')
      .eq('journey_id', journeyId)
      .eq('status', 'approved')
      .order('id', { ascending: true })
      .range(from, to),
  )
  if (chargeRows.length === 0 && payRows.length === 0) return null

  let chargedCents = 0
  for (const r of chargeRows) chargedCents += toCents(r.amount)
  let collectedCents = 0
  for (const r of payRows) collectedCents += toCents(r.amount)

  return {
    charged: centsToNumber(chargedCents),
    collected: centsToNumber(collectedCents),
    outstanding: centsToNumber(chargedCents - collectedCents),
  }
}

/** Общежитие: ТЕКУЩЕЕ активное назначение (комната + здание). */
async function loadDormitory(sb: Sb, journeyId: string, today: string): Promise<OverviewDormitory | null> {
  const { data, error } = await sb
    .from('dorm_assignments')
    .select('assigned_from, assigned_to, status, room:dorm_rooms(room_number, building:dorm_buildings(name))')
    .eq('journey_id', journeyId)
    .eq('status', 'active')
    .order('assigned_from', { ascending: false })
  if (error) throw error

  type Row = {
    assigned_from: string
    assigned_to: string | null
    status: string
    room: { room_number: string | null; building: { name: string | null } | null } | null
  }
  const rows = (data ?? []) as unknown as Row[]
  const current = pickCurrentActive(rows, r => isDormActiveOn(r, today), r => r.assigned_from)
  if (!current) return null

  return {
    building: current.room?.building?.name ?? null,
    room: current.room?.room_number ?? null,
    since: current.assigned_from,
  }
}

/** Питание: ТЕКУЩАЯ активная запись на план питания. */
async function loadFood(sb: Sb, journeyId: string, today: string): Promise<OverviewFood | null> {
  const { data, error } = await sb
    .from('meal_enrollments')
    .select('enrolled_from, enrolled_to, status, plan:meal_plans(name)')
    .eq('journey_id', journeyId)
    .eq('status', 'active')
    .order('enrolled_from', { ascending: false })
  if (error) throw error

  type Row = {
    enrolled_from: string
    enrolled_to: string | null
    status: string
    plan: { name: string | null } | null
  }
  const rows = (data ?? []) as unknown as Row[]
  const current = pickCurrentActive(rows, r => isFoodActiveOn(r, today), r => r.enrolled_from)
  if (!current) return null

  return {
    plan_name: current.plan?.name ?? null,
    since: current.enrolled_from,
  }
}

/** Медпункт: открытые приёмы, дата последнего приёма, наличие аллергий. */
async function loadMedical(sb: Sb, journeyId: string): Promise<OverviewMedical | null> {
  const [openRes, lastRes, profRes] = await Promise.all([
    sb
      .from('medical_visits')
      .select('id', { count: 'exact', head: true })
      .eq('journey_id', journeyId)
      .eq('status', 'open'),
    sb
      .from('medical_visits')
      .select('visit_date')
      .eq('journey_id', journeyId)
      .order('visit_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb.from('medical_profiles').select('allergies').eq('journey_id', journeyId).maybeSingle(),
  ])
  if (openRes.error) throw openRes.error
  if (lastRes.error) throw lastRes.error
  if (profRes.error) throw profRes.error

  const lastVisit = lastRes.data as { visit_date: string | null } | null
  const profile = profRes.data as { allergies: string | null } | null
  if (!lastVisit && !profile) return null

  return {
    open_visits: openRes.count ?? 0,
    last_visit_date: lastVisit?.visit_date ?? null,
    has_allergies: hasAllergies(profile?.allergies ?? null),
  }
}

/** Психолог: открытые консультации + уровень риска из карты сопровождения. */
async function loadCounseling(sb: Sb, journeyId: string): Promise<OverviewCounseling | null> {
  const [openRes, anyRes, profRes] = await Promise.all([
    sb
      .from('psych_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('journey_id', journeyId)
      .eq('status', 'open'),
    sb.from('psych_sessions').select('id').eq('journey_id', journeyId).limit(1).maybeSingle(),
    sb.from('psych_profiles').select('risk_level').eq('journey_id', journeyId).maybeSingle(),
  ])
  if (openRes.error) throw openRes.error
  if (anyRes.error) throw anyRes.error
  if (profRes.error) throw profRes.error

  const anySession = anyRes.data as { id: string } | null
  const profile = profRes.data as { risk_level: string | null } | null
  if (!anySession && !profile) return null

  return {
    open_sessions: openRes.count ?? 0,
    risk_level: profile?.risk_level ?? null,
  }
}

/** Документы: активных в реестре, из них истекает скоро и просрочено. */
async function loadDocuments(sb: Sb, journeyId: string, today: string): Promise<OverviewDocuments | null> {
  const docs = await pageAll<{ expiry_date: string | null; status: string; doc_type: string }>(
    (from, to) =>
      sb
        .from('document_records')
        .select('expiry_date, status, doc_type')
        .eq('journey_id', journeyId)
        .order('id', { ascending: true })
        .range(from, to),
  )
  if (docs.length === 0) return null
  const s = documentStats(docs, today)
  return { total: s.active, expiring_soon: s.expiring_soon, expired: s.expired }
}

/**
 * GET /api/students/[id]/overview   ([id] = education_journeys.id)
 *
 * Консолидированный обзор одного студента, собирающий данные из всех модулей.
 * Только чтение, новых таблиц нет. Верхний гейт — право education view_students
 * в подразделении студента (как карточка студента). Каждая чувствительная секция
 * (finance/dormitory/food/medical/counseling) включается ТОЛЬКО если у смотрящего
 * есть привилегия 'view' соответствующего модуля; иначе секция = null и её нет в
 * visible_sections. Секция также = null, если у студента нет данных в модуле.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth()
    const sb = createServerClient()
    const id = params.id

    // 1. Journey + персона + учебные основы (грузятся всегда).
    const { data: journeyRow, error: jErr } = await sb
      .from('education_journeys')
      .select(`
        id, primary_department_id, education_status, opened_at, application_date,
        person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name, email, phones, photo_url),
        primary_department:departments!education_journeys_primary_department_id_fkey(name),
        specialty:specialties!education_journeys_specialty_id_fkey(name, code)
      `)
      .eq('id', id)
      .maybeSingle()
    if (jErr) throw jErr
    if (!journeyRow) return NextResponse.json({ error: 'Студент не найден' }, { status: 404 })

    const journey = journeyRow as unknown as {
      id: string
      primary_department_id: string | null
      education_status: string | null
      opened_at: string | null
      application_date: string | null
      person: {
        full_name: string | null
        hebrew_name: string | null
        email: string | null
        phones: unknown
        photo_url: string | null
      } | null
      primary_department: { name: string } | null
      specialty: { name: string; code: string | null } | null
    }

    // 2. Верхний гейт — как карточка студента: view_students в его подразделении.
    const eduGate = await hasEducationPrivilege(session, 'view_students', {
      department_id: journey.primary_department_id ?? undefined,
    })
    if (!eduGate) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })

    // 3. Привилегии 'view' по чувствительным модулям.
    const [pFin, pDorm, pFood, pDoc, pPsy, pDocs] = await Promise.all([
      hasFinancePrivilege(session, 'view'),
      hasDormitoryPrivilege(session, 'view'),
      hasFoodPrivilege(session, 'view'),
      hasDoctorPrivilege(session, 'view'),
      hasPsychologistPrivilege(session, 'view'),
      hasDocumentsPrivilege(session, 'view'),
    ])

    const today = new Date().toISOString().slice(0, 10)

    // 4. Данные разрешённых секций — параллельно. Null, если нет права ИЛИ данных.
    const [finance, dormitory, food, medical, counseling, documents] = await Promise.all([
      pFin ? loadFinance(sb, id) : Promise.resolve(null),
      pDorm ? loadDormitory(sb, id, today) : Promise.resolve(null),
      pFood ? loadFood(sb, id, today) : Promise.resolve(null),
      pDoc ? loadMedical(sb, id) : Promise.resolve(null),
      pPsy ? loadCounseling(sb, id) : Promise.resolve(null),
      pDocs ? loadDocuments(sb, id, today) : Promise.resolve(null),
    ])

    const p = journey.person
    const result: StudentOverview = {
      person: {
        full_name: p?.full_name ?? '',
        hebrew_name: p?.hebrew_name ?? null,
        email: p?.email ?? null,
        phones: flattenPhones(p?.phones),
        photo_url: p?.photo_url ?? null,
      },
      education: {
        status: journey.education_status,
        department: journey.primary_department?.name ?? null,
        specialty: journey.specialty
          ? journey.specialty.code
            ? `[${journey.specialty.code}] ${journey.specialty.name}`
            : journey.specialty.name
          : null,
        opened_at: journey.opened_at ?? journey.application_date,
      },
      finance,
      dormitory,
      food,
      medical,
      counseling,
      documents,
      visible_sections: visibleSections({
        finance: pFin,
        dormitory: pDorm,
        food: pFood,
        doctor: pDoc,
        psychologist: pPsy,
        documents: pDocs,
      }),
    }

    return NextResponse.json(result)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
