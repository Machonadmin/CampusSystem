import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireFinancePrivilege } from '@/lib/finance/permissions'

/**
 * Привязка КОНКРЕТНЫХ студенток к семестру (решение владельца: начисляем не всем
 * активным, а тем, кого менеджер сам назначил).
 *   GET  → { enrollments: [{ journey_id, name, charge_id, amount, charge_status }] } (view).
 *   POST → назначить { journey_ids: [] }: каждой — счёт (category='tuition', цена
 *          семестра) + привязка. Идемпотентно: уже привязанные пропускаются. (create_invoice)
 * Деплой-безопасно (42P01/42703 → 503).
 */
function u(sb: ReturnType<typeof createServerClient>) { return sb as unknown as SupabaseClient }

type Sem = { id: string; year_label: string; term_number: number; name: string | null; price: number }

async function loadSemester(sb: ReturnType<typeof createServerClient>, id: string): Promise<Sem | null | 'missing'> {
  try {
    const { data, error } = await u(sb).from('semesters')
      .select('id, year_label, term_number, name, price').eq('id', id).maybeSingle()
    if (error) throw error
    return (data ?? null) as Sem | null
  } catch (e) {
    if ((e as { code?: string }).code === '42P01') return 'missing'
    throw e
  }
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireFinancePrivilege('view')
    const sb = createServerClient()

    let rows: Array<{ journey_id: string; charge_id: string | null }>
    try {
      const { data, error } = await u(sb).from('semester_enrollments')
        .select('journey_id, charge_id').eq('semester_id', params.id)
      if (error) throw error
      rows = (data ?? []) as typeof rows
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ enrollments: [] })
      throw e
    }
    if (rows.length === 0) return NextResponse.json({ enrollments: [] })

    // Имена студенток.
    const journeyIds = [...new Set(rows.map(r => r.journey_id))]
    const nameById = new Map<string, string>()
    const { data: js } = await sb.from('education_journeys')
      .select('id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name)')
      .in('id', journeyIds)
    for (const j of (js ?? []) as Array<{ id: string; person: { full_name?: string | null; hebrew_name?: string | null } | null }>) {
      nameById.set(j.id, (j.person?.full_name || j.person?.hebrew_name || '').trim())
    }

    // Статус/сумма счёта.
    const chargeIds = rows.map(r => r.charge_id).filter(Boolean) as string[]
    const chargeById = new Map<string, { amount: number; status: string }>()
    if (chargeIds.length) {
      const { data: ch } = await u(sb).from('finance_charges').select('id, amount, status').in('id', chargeIds)
      for (const c of (ch ?? []) as Array<{ id: string; amount: number; status: string }>) {
        chargeById.set(c.id, { amount: Number(c.amount), status: c.status })
      }
    }

    const enrollments = rows.map(r => {
      const c = r.charge_id ? chargeById.get(r.charge_id) : undefined
      return {
        journey_id: r.journey_id,
        name: nameById.get(r.journey_id) ?? '',
        charge_id: r.charge_id,
        amount: c?.amount ?? null,
        charge_status: c?.status ?? null,
      }
    }).sort((a, b) => a.name.localeCompare(b.name, 'he'))

    return NextResponse.json({ enrollments })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireFinancePrivilege('create_invoice')
    const sb = createServerClient()

    const body = await request.json().catch(() => ({})) as { journey_ids?: string[] }
    const wanted = [...new Set((body.journey_ids ?? []).filter(Boolean))]
    if (wanted.length === 0) return apiError('invalid_reference', 400)

    const semester = await loadSemester(sb, params.id)
    if (semester === 'missing') return apiError('feature_not_migrated', 503)
    if (!semester) return apiError('not_found', 404)

    const label = semester.name?.trim() || `${semester.year_label} · ${semester.term_number}`
    const price = Number(semester.price)

    // Уже привязанные — пропускаем.
    const already = new Set<string>()
    try {
      const { data: enr, error } = await u(sb).from('semester_enrollments')
        .select('journey_id').eq('semester_id', params.id).in('journey_id', wanted)
      if (error) throw error
      for (const r of (enr ?? []) as Array<{ journey_id: string }>) already.add(r.journey_id)
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      throw e
    }

    const todo = wanted.filter(id => !already.has(id))
    let created = 0
    for (const journeyId of todo) {
      const { data: charge, error: cErr } = await u(sb).from('finance_charges')
        .insert({
          journey_id: journeyId, amount: price, description: label, period_label: label,
          category: 'tuition', semester_id: params.id, created_by: session.person_id,
        })
        .select('id').single()
      if (cErr) {
        if (['42P01', '42703'].includes((cErr as { code?: string }).code ?? '')) return apiError('feature_not_migrated', 503)
        if ((cErr as { code?: string }).code === '23503') return apiError('invalid_reference', 400)
        throw cErr
      }
      const { error: eErr } = await u(sb).from('semester_enrollments')
        .insert({ semester_id: params.id, journey_id: journeyId, charge_id: (charge as { id: string }).id, created_by: session.person_id })
      if (eErr && (eErr as { code?: string }).code !== '23505') {
        if ((eErr as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
        throw eErr
      }
      created++
    }

    return NextResponse.json({ created, skipped: already.size })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
