import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageFinanceAccess } from '@/lib/finance/access'

/**
 * Финансовый доступ (кто из сотрудников видит финансы студенток).
 *   GET  — список грантов (+ имена сотрудника и, для scope='journey', студентки).
 *   POST — выдать грант { person_id, scope('all'|'journey'), journey_id? }.
 * Право: canManageFinanceAccess (менеджер: superadmin / finance.approve_payment).
 * Деплой-безопасно к отсутствию таблицы (42P01).
 */
function grants(sb: ReturnType<typeof createServerClient>) {
  return (sb as unknown as SupabaseClient).from('finance_access_grants')
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageFinanceAccess(session))) return apiError('forbidden', 403)

    const sb = createServerClient()
    let rows: Array<{ id: string; person_id: string; scope: string; journey_id: string | null; created_at: string }> = []
    try {
      const { data, error } = await grants(sb)
        .select('id, person_id, scope, journey_id, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      rows = (data ?? []) as typeof rows
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ grants: [] })
      throw e
    }

    // Имена сотрудников.
    const personIds = [...new Set(rows.map(r => r.person_id))]
    const personName = new Map<string, string>()
    if (personIds.length) {
      const { data: ps } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', personIds)
      for (const p of (ps ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) {
        personName.set(p.id, (p.full_name || p.hebrew_name || '').trim())
      }
    }
    // Имена студенток (для scope='journey').
    const journeyIds = [...new Set(rows.map(r => r.journey_id).filter(Boolean) as string[])]
    const journeyName = new Map<string, string>()
    if (journeyIds.length) {
      const { data: js } = await sb
        .from('education_journeys')
        .select('id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name)')
        .in('id', journeyIds)
      for (const j of (js ?? []) as unknown as Array<{ id: string; person: { full_name: string | null; hebrew_name: string | null } | null }>) {
        journeyName.set(j.id, (j.person?.full_name || j.person?.hebrew_name || '').trim())
      }
    }

    return NextResponse.json({
      grants: rows.map(r => ({
        id: r.id, person_id: r.person_id, scope: r.scope, journey_id: r.journey_id,
        person_name: personName.get(r.person_id) ?? '',
        journey_name: r.journey_id ? (journeyName.get(r.journey_id) ?? '') : null,
        created_at: r.created_at,
      })),
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageFinanceAccess(session))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { person_id?: string; scope?: string; journey_id?: string | null }
    const personId = (body.person_id ?? '').trim()
    const scope = body.scope
    if (!personId) return apiError('invalid_reference', 400)
    if (scope !== 'all' && scope !== 'journey') return apiError('invalid_reference', 400)
    const journeyId = scope === 'journey' ? (body.journey_id ?? '').trim() : null
    if (scope === 'journey' && !journeyId) return apiError('invalid_reference', 400)

    const sb = createServerClient()
    const { data, error } = await grants(sb)
      .insert({ person_id: personId, scope, journey_id: journeyId, granted_by: session.person_id })
      .select('id, person_id, scope, journey_id, created_at')
      .single()
    if (error) {
      const code = (error as { code?: string }).code
      if (code === '42P01') return apiError('feature_not_migrated', 503)
      if (code === '23505') return NextResponse.json({ ok: true }, { status: 200 }) // уже выдан — идемпотентно
      if (code === '23503') return apiError('invalid_reference', 400)
      throw error
    }
    return NextResponse.json({ grant: data }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
