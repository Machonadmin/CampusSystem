import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { getEducationPrivilegeScope } from '@/lib/education/permissions'

/**
 * Семестры — АКАДЕМИЧЕСКОЕ действие (решение владельца: семестр «открывают» в
 * учёбе, а финансы лишь ОТОБРАЖАЮТ его со студентками и долгом). Здесь — только
 * учебные поля (год, номер, имя, статус). ЦЕНА НЕ ТРОГАЕТСЯ и НЕ отдаётся —
 * это забота финансов (ответственная за учёбу не видит денег).
 *
 * GET  — список (без цены). POST — открыть семестр.
 * Право: управление учебной структурой (manage_class_groups) или superadmin.
 * Таблица `semesters` общая с финансами. Деплой-безопасно (42P01).
 */
function sem(sb: ReturnType<typeof createServerClient>) {
  return (sb as unknown as SupabaseClient).from('semesters')
}

// Семестры — институтский объект: управлять может только тот, у кого управление
// учебной структурой на уровне ВСЕГО института (scope='all'), либо superadmin.
// Так департамент-скоуп (напр. dept_head) не трогает глобальные семестры.
async function canManage(session: Awaited<ReturnType<typeof getSession>>): Promise<boolean> {
  if (!session) return false
  if (session.roles.includes('superadmin')) return true
  return (await getEducationPrivilegeScope(session, 'manage_class_groups')) === 'all'
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManage(session))) return apiError('forbidden', 403)

    const sb = createServerClient()
    try {
      const { data, error } = await sem(sb)
        .select('id, year_label, term_number, name, status, created_at')
        .order('year_label', { ascending: false })
        .order('term_number', { ascending: true })
      if (error) throw error
      return NextResponse.json({ semesters: data ?? [] })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ semesters: [] })
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManage(session))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { year_label?: string; term_number?: number; name?: string }
    const yearLabel = (body.year_label ?? '').trim()
    const termNumber = Number(body.term_number)
    if (!yearLabel) return apiError('year_label_required', 400)
    if (!Number.isInteger(termNumber) || termNumber < 1) return apiError('term_number_required', 400)

    const sb = createServerClient()
    // Цену НЕ задаём — сработает DEFAULT таблицы (210000); финансы её переопределят.
    const { data, error } = await sem(sb)
      .insert({
        year_label: yearLabel,
        term_number: termNumber,
        name: (body.name ?? '').trim() || null,
        created_by: session.person_id,
      })
      .select('id, year_label, term_number, name, status, created_at')
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
