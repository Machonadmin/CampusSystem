import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireFinancePrivilege, hasFinancePrivilege } from '@/lib/finance/permissions'

/**
 * Финансовый список семестров (с ЦЕНОЙ). Семестры ОТКРЫВАЮТ в «Учёбе»
 * (решение владельца) — здесь их только показываем; создания отсюда нет.
 * Управление ценой — PATCH /[id]; привязка студенток и долг — /[id]/enrollments.
 *
 * GET — список (право finance.view). Деплой-безопасно к отсутствию таблицы.
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
