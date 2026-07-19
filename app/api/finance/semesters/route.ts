import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireFinancePrivilege, hasFinancePrivilege } from '@/lib/finance/permissions'

/**
 * Семестры (учебные периоды со ЦЕНОЙ). Учебный год = 2 семестра (можно добавить
 * ещё). Цена по умолчанию 210000 (переопределяется). «Открыть семестр» = создать
 * его с ценой; начисление счетов — отдельным действием (/[id]/generate).
 *
 * GET  — список (право finance.view). Деплой-безопасно к отсутствию таблицы.
 * POST — создать семестр (право finance.create_invoice).
 */
const DEFAULT_PRICE = 210000

function sem(sb: ReturnType<typeof createServerClient>) {
  return (sb as unknown as SupabaseClient).from('semesters')
}

export async function GET() {
  try {
    const session = await requireFinancePrivilege('view')
    const canManage = await hasFinancePrivilege(session, 'create_invoice')
    const sb = createServerClient()
    try {
      const { data, error } = await sem(sb)
        .select('id, year_label, term_number, name, price, status, created_at')
        .order('year_label', { ascending: false })
        .order('term_number', { ascending: true })
      if (error) throw error
      return NextResponse.json({ semesters: data ?? [], default_price: DEFAULT_PRICE, can_manage: canManage })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') {
        return NextResponse.json({ semesters: [], default_price: DEFAULT_PRICE, can_manage: canManage })
      }
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireFinancePrivilege('create_invoice')
    const body = await request.json().catch(() => ({})) as {
      year_label?: string; term_number?: number; name?: string; price?: number
    }
    const yearLabel = (body.year_label ?? '').trim()
    const termNumber = Number(body.term_number)
    if (!yearLabel) return apiError('year_label_required', 400)
    if (!Number.isInteger(termNumber) || termNumber < 1) return apiError('term_number_required', 400)
    const price = Number.isFinite(Number(body.price)) && Number(body.price) >= 0 ? Number(body.price) : DEFAULT_PRICE

    const sb = createServerClient()
    const { data, error } = await sem(sb)
      .insert({
        year_label: yearLabel,
        term_number: termNumber,
        name: (body.name ?? '').trim() || null,
        price,
        created_by: session.person_id,
      })
      .select('id, year_label, term_number, name, price, status, created_at')
      .single()
    if (error) {
      if ((error as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      if ((error as { code?: string }).code === '23505') return apiError('semester_exists', 409)
      throw error
    }
    return NextResponse.json({ semester: data }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
