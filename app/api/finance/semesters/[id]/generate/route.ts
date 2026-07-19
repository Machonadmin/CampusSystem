import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireFinancePrivilege } from '@/lib/finance/permissions'

/**
 * POST /api/finance/semesters/[id]/generate
 * Начисляет счёт за обучение (category='tuition') всем активным студенткам
 * (education_status='student'), которые ещё НЕ привязаны к этому семестру.
 * Сумма = цена семестра. Идемпотентно: повторный запуск не дублирует —
 * уже привязанные (semester_enrollments) пропускаются. Право: create_invoice.
 *
 * Это и есть «автоматическое» начисление при открытии семестра. Строго
 * добавляющее: не трогает существующие счета/привязки.
 */
function u(sb: ReturnType<typeof createServerClient>) {
  return sb as unknown as SupabaseClient
}

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireFinancePrivilege('create_invoice')
    const sb = createServerClient()

    // Семестр + цена.
    type Sem = { id: string; year_label: string; term_number: number; name: string | null; price: number }
    let semester: Sem | null = null
    try {
      const { data, error } = await u(sb).from('semesters')
        .select('id, year_label, term_number, name, price').eq('id', params.id).maybeSingle()
      if (error) throw error
      semester = (data ?? null) as Sem | null
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      throw e
    }
    if (!semester) return apiError('not_found', 404)

    const label = semester.name?.trim() || `${semester.year_label} · ${semester.term_number}`
    const price = Number(semester.price)

    // Активные студентки.
    const { data: journeysRaw, error: jErr } = await sb
      .from('education_journeys').select('id').eq('education_status', 'student')
    if (jErr) throw jErr
    const journeyIds = (journeysRaw ?? []).map(j => j.id as string)
    if (journeyIds.length === 0) return NextResponse.json({ created: 0, skipped: 0 })

    // Уже привязанные к этому семестру — пропускаем.
    const already = new Set<string>()
    try {
      const { data: enr, error } = await u(sb).from('semester_enrollments')
        .select('journey_id').eq('semester_id', params.id)
      if (error) throw error
      for (const r of (enr ?? []) as Array<{ journey_id: string }>) already.add(r.journey_id)
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      throw e
    }

    const todo = journeyIds.filter(id => !already.has(id))
    let created = 0
    for (const journeyId of todo) {
      // 1) счёт за обучение
      const { data: charge, error: cErr } = await u(sb).from('finance_charges')
        .insert({
          journey_id: journeyId,
          amount: price,
          description: label,
          period_label: label,
          category: 'tuition',
          semester_id: params.id,
          created_by: session.person_id,
        })
        .select('id')
        .single()
      if (cErr) {
        if (['42P01', '42703'].includes((cErr as { code?: string }).code ?? '')) return apiError('feature_not_migrated', 503)
        throw cErr
      }
      // 2) привязка (idempotent-safe)
      const { error: eErr } = await u(sb).from('semester_enrollments')
        .insert({ semester_id: params.id, journey_id: journeyId, charge_id: (charge as { id: string }).id, created_by: session.person_id })
      if (eErr && (eErr as { code?: string }).code !== '23505') {
        if (['42P01'].includes((eErr as { code?: string }).code ?? '')) return apiError('feature_not_migrated', 503)
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
