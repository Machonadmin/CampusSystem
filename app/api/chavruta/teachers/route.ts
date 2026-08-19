import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canViewStaffComp, canManageStaffComp } from '@/lib/finance/staff-comp'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'

/**
 * «Моры хавруты»: список (кодеш авто ∪ ручные) + управление ручными.
 *   GET    → { teachers: [{ person_id, name, source }] } (view).
 *   POST   → добавить ручного { person_id } (manage).
 * Право просмотра/управления — как staff-comp. Деплой-безопасно.
 */
function ct(sb: ReturnType<typeof createServerClient>) {
  return (sb as unknown as SupabaseClient).from('chavruta_teachers')
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canViewStaffComp(session))) return apiError('forbidden', 403)

    const sb = createServerClient()
    // Кодеш-учителя (авто).
    const kodeshSet = new Set<string>()
    try {
      const { data: groups } = await sb.from('class_groups').select('id').eq('department_id', KODESH_DEPT_ID)
      const groupIds = (groups ?? []).map(g => g.id)
      if (groupIds.length) {
        const { data: teachers } = await sb.from('class_teachers').select('teacher_id').in('class_group_id', groupIds)
        for (const r of (teachers ?? []) as Array<{ teacher_id: string }>) kodeshSet.add(r.teacher_id)
      }
    } catch { /* ignore */ }
    // Ручные.
    const manualSet = new Set<string>()
    try {
      const { data } = await ct(sb).select('person_id')
      for (const r of (data ?? []) as Array<{ person_id: string }>) manualSet.add(r.person_id)
    } catch { /* 42P01 → пусто */ }

    const allIds = [...new Set([...kodeshSet, ...manualSet])]
    const nameById = new Map<string, string>()
    if (allIds.length) {
      const { data: ps } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', allIds)
      for (const p of (ps ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) {
        nameById.set(p.id, (p.full_name || p.hebrew_name || '').trim())
      }
    }
    const teachers = allIds.map(id => ({
      person_id: id,
      name: nameById.get(id) ?? '',
      source: kodeshSet.has(id) ? 'kodesh' : 'manual',
    })).sort((a, b) => a.name.localeCompare(b.name, 'he'))

    return NextResponse.json({ teachers })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageStaffComp(session))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { person_id?: string }
    const personId = (body.person_id ?? '').trim()
    if (!personId) return apiError('invalid_reference', 400)

    const sb = createServerClient()
    const { error } = await ct(sb).insert({ person_id: personId, added_by: session.person_id })
    if (error) {
      const code = (error as { code?: string }).code
      if (code === '42P01') return apiError('feature_not_migrated', 503)
      if (code === '23505') return NextResponse.json({ ok: true }) // уже в списке
      if (code === '23503') return apiError('invalid_reference', 400)
      throw error
    }
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
