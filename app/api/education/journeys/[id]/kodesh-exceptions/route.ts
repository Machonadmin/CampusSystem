import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageUnit } from '@/lib/education/unit-access'

/**
 * Исключения кодеша (חריגות קודש) для journey (id = journey_id).
 *
 * Обязательные утренние слоты кодеша — «всегда кодеш, ЕСЛИ нет особого
 * одобрения менеджера». Здесь менеджер кодеша выдаёт/снимает одобренное
 * ИСКЛЮЧЕНИЕ (освобождение) студентки: кто одобрил, причина, диапазон дат.
 *
 *   GET    — список исключений journey + can_manage.
 *   POST   — выдать исключение ({ reason?, effective_from?, effective_to? }).
 *   DELETE — снять исключение (?exception_id=).
 *
 * Право на ВСЕ методы: canManageUnit(session, KODESH_DEPT_ID) — superadmin,
 * глава кафедры иудаики или её делегат. Студентка/посторонний — всегда 403.
 * Деплой-безопасно к отсутствию таблицы kodesh_exceptions (42P01).
 */
const KODESH_DEPT_ID = '9a3d7b3f-3f65-4653-a111-4d5296404a27'

// kodesh_exceptions ещё нет в сгенерированных типах БД (миграция применяется
// владельцем) — обращаемся к ней через нетипизированный клиент.
function exc(sb: ReturnType<typeof createServerClient>) {
  return (sb as unknown as SupabaseClient).from('kodesh_exceptions')
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const canManage = await canManageUnit(session, KODESH_DEPT_ID)
    if (!canManage) return apiError('forbidden', 403)

    const sb = createServerClient()

    let rows: Array<{
      id: string; reason: string | null; effective_from: string
      effective_to: string | null; approved_by: string | null; created_at: string
    }> = []
    try {
      const { data, error } = await exc(sb)
        .select('id, reason, effective_from, effective_to, approved_by, created_at')
        .eq('journey_id', params.id)
        .order('effective_from', { ascending: false })
      if (error) throw error
      rows = (data ?? []) as typeof rows
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') {
        return NextResponse.json({ exceptions: [], can_manage: canManage })
      }
      throw e
    }

    const approverIds = [...new Set(rows.map(r => r.approved_by).filter(Boolean) as string[])]
    const nameById = new Map<string, string>()
    if (approverIds.length > 0) {
      const { data: persons } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', approverIds)
      for (const p of (persons ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) {
        nameById.set(p.id, (p.full_name || p.hebrew_name || '').trim())
      }
    }

    const exceptions = rows.map(r => ({
      id: r.id,
      reason: r.reason,
      effective_from: r.effective_from,
      effective_to: r.effective_to,
      approved_by_name: r.approved_by ? nameById.get(r.approved_by) ?? null : null,
      created_at: r.created_at,
    }))
    return NextResponse.json({ exceptions, can_manage: canManage })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code === '42P01') return NextResponse.json({ exceptions: [], can_manage: false })
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageUnit(session, KODESH_DEPT_ID))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as {
      reason?: string; effective_from?: string; effective_to?: string
    }
    const reason = (body.reason ?? '').trim() || null
    const today = new Date().toISOString().slice(0, 10)
    const effectiveFrom = (body.effective_from ?? '').trim() || today
    const effectiveTo = (body.effective_to ?? '').trim() || null
    if (effectiveTo !== null && effectiveTo < effectiveFrom) {
      return apiError('invalid_reference', 400)
    }

    const sb = createServerClient()
    const { data, error } = await exc(sb)
      .insert({
        journey_id: params.id,
        approved_by: session.person_id,
        reason: reason ? reason.slice(0, 2000) : null,
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
      })
      .select('id, reason, effective_from, effective_to, approved_by, created_at')
      .single()
    if (error) {
      if ((error as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      if ((error as { code?: string }).code === '23503') return apiError('invalid_reference', 400)
      throw error
    }
    return NextResponse.json({ exception: data }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageUnit(session, KODESH_DEPT_ID))) return apiError('forbidden', 403)

    const exceptionId = (request.nextUrl.searchParams.get('exception_id') ?? '').trim()
    if (!exceptionId) return apiError('invalid_reference', 400)

    const sb = createServerClient()
    const { error } = await exc(sb)
      .delete()
      .eq('id', exceptionId)
      .eq('journey_id', params.id)
    if (error) {
      if ((error as { code?: string }).code === '42P01') return NextResponse.json({ ok: true })
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
