import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny, hasEducationPrivilege, requireEducationPrivilege } from '@/lib/education/permissions'
import { parseBody, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'

/**
 * Оповещения по студенткам (student_alerts, spec §3.8/§4.4).
 *
 * GET — список с фильтрами (state/type_code/severity/student_id) ИЛИ counts=1 +
 *   student_ids=a,b — счётчики открытых (state<>'closed') по студенткам.
 *   Чувствительные строки (is_sensitive) видны только с view_sensitive_alerts
 *   (иначе исключаются и из списка, и из счётчиков). Право: view_students.
 * POST — создать оповещение (manage_alerts). is_sensitive по умолчанию берётся из
 *   default_sensitive типа.
 * Deploy-safe: нет таблицы → пусто.
 */

async function canSeeSensitive(session: Parameters<typeof hasEducationPrivilege>[0]): Promise<boolean> {
  return hasEducationPrivilege(session, 'view_sensitive_alerts')
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const allowed = (await canDoEducationInAny(session, 'view_students'))
      || (await hasEducationPrivilege(session, 'manage_alerts'))
    if (!allowed) return apiError('forbidden', 403)

    const url = new URL(request.url)
    const sb = createServerClient()
    const seeSensitive = await canSeeSensitive(session)

    // Режим счётчиков.
    if (url.searchParams.get('counts') === '1') {
      const ids = (url.searchParams.get('student_ids') ?? '').split(',').map(s => s.trim()).filter(Boolean)
      if (ids.length === 0) return NextResponse.json({ counts: {} })
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (sb.from('student_alerts') as any).select('student_id, is_sensitive').neq('state', 'closed').in('student_id', ids)
        if (!seeSensitive) q = q.eq('is_sensitive', false)
        const { data, error } = await q
        if (error) throw error
        const counts: Record<string, number> = {}
        for (const r of (data ?? []) as Array<{ student_id: string }>) counts[r.student_id] = (counts[r.student_id] ?? 0) + 1
        return NextResponse.json({ counts })
      } catch (e) {
        if ((e as { code?: string }).code === '42P01') return NextResponse.json({ counts: {} })
        throw e
      }
    }

    // Режим списка.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (sb.from('student_alerts') as any)
        .select('id, student_id, type_code, source_module, severity, title, body, reported_by, state, handled_by, handled_at, is_sensitive, created_at, student:persons!student_alerts_student_id_fkey(id, full_name, hebrew_name)')
        .order('created_at', { ascending: false })
      const state = url.searchParams.get('state'); if (state) q = q.eq('state', state)
      const typeCode = url.searchParams.get('type_code'); if (typeCode) q = q.eq('type_code', typeCode)
      const severity = url.searchParams.get('severity'); if (severity) q = q.eq('severity', severity)
      const studentId = url.searchParams.get('student_id'); if (studentId) q = q.eq('student_id', studentId)
      if (!seeSensitive) q = q.eq('is_sensitive', false)
      const { data, error } = await q
      if (error) throw error
      return NextResponse.json({ alerts: data ?? [], can_see_sensitive: seeSensitive })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ alerts: [], can_see_sensitive: seeSensitive })
      throw e
    }
  } catch (err: unknown) {
    return jsonError(err)
  }
}

const createSchema = z.object({
  student_id: z.string().uuid(),
  type_code: z.string().trim().max(40).nullish(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  title: z.string().trim().max(300).nullish(),
  body: z.string().trim().max(5000).nullish(),
  source_module: z.string().trim().max(40).nullish(),
  is_sensitive: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, createSchema)
    const session = await requireEducationPrivilege('manage_alerts')
    const sb = createServerClient()

    // is_sensitive по умолчанию — из типа.
    let isSensitive = body.is_sensitive
    if (isSensitive === undefined && body.type_code) {
      const { data: tp } = await sb.from('student_alert_types').select('default_sensitive').eq('code', body.type_code).maybeSingle()
      isSensitive = (tp as { default_sensitive?: boolean } | null)?.default_sensitive ?? false
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from('student_alerts') as any).insert({
      student_id: body.student_id,
      type_code: body.type_code ?? null,
      severity: body.severity ?? 'info',
      title: body.title ?? null,
      body: body.body ?? null,
      source_module: body.source_module ?? null,
      reported_by: session.person_id,
      is_sensitive: isSensitive ?? false,
    }).select('id').single()
    if (error) {
      if (error.code === '42P01') return apiError('feature_not_migrated', 503)
      if (error.code === '23503') return apiError('invalid_reference', 400)
      throw error
    }
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
