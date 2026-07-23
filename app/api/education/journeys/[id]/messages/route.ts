import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { isOwnStudentJourney } from '@/lib/education/portal-access'
import { journeyDeptTarget } from '@/lib/education/journey-target'

/**
 * Сообщения студентке от сотрудника (staff → student).
 *
 *   GET   — список сообщений journey (свежие сверху) с именем отправителя.
 *           Право: студентка — только своя journey (иначе 403); staff —
 *           view_students по подразделению journey (или superadmin).
 *   POST  — отправить сообщение ({ subject?, body }). Право: ТОЛЬКО staff с
 *           manage_students (или superadmin); студентка — всегда 403.
 *   PATCH — пометить прочитанным ({ message_id }). Только сама студентка-владелица
 *           (principal==='student' && student_journey_id===id); staff — 403.
 *
 * Устойчиво к отсутствию таблицы student_messages (deploy до миграции).
 */

// student_messages ещё нет в сгенерированных типах БД (миграция применяется
// владельцем) — обращаемся к ней через нетипизированный клиент.
function msgs(sb: ReturnType<typeof createServerClient>) {
  return (sb as unknown as SupabaseClient).from('student_messages')
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()
    // Байпас для студентки: свои сообщения — только своя journey (иначе 403);
    // staff-путь проверяется как обычно, ниже.
    if (session.principal === 'student') {
      if (session.student_journey_id !== params.id) return apiError('forbidden', 403)
    } else {
      const allowed = session.roles.includes('superadmin')
        || await hasEducationPrivilege(session, 'view_students', await journeyDeptTarget(sb, params.id))
      if (!allowed) return apiError('forbidden', 403)
    }

    const { data, error } = await msgs(sb)
      .select('id, subject, body, from_person_id, created_at, read_at')
      .eq('journey_id', params.id)
      .order('created_at', { ascending: false })
    if (error) {
      if ((error as { code?: string }).code === '42P01') return NextResponse.json({ messages: [] })
      throw error
    }

    const rows = (data ?? []) as Array<{
      id: string; subject: string | null; body: string
      from_person_id: string | null; created_at: string; read_at: string | null
    }>
    const senderIds = [...new Set(rows.map(r => r.from_person_id).filter(Boolean) as string[])]
    const nameById = new Map<string, string>()
    if (senderIds.length > 0) {
      const { data: persons } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', senderIds)
      for (const p of (persons ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) {
        nameById.set(p.id, (p.full_name || p.hebrew_name || '').trim())
      }
    }

    const messages = rows.map(r => ({
      id: r.id,
      subject: r.subject,
      body: r.body,
      from_name: r.from_person_id ? nameById.get(r.from_person_id) ?? null : null,
      created_at: r.created_at,
      read_at: r.read_at,
    }))
    return NextResponse.json({ messages })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    // Студентка НИКОГДА не отправляет сообщения.
    if (session.principal === 'student') return apiError('forbidden', 403)
    const sb = createServerClient()
    const allowed = session.roles.includes('superadmin')
      || await hasEducationPrivilege(session, 'manage_students', await journeyDeptTarget(sb, params.id))
    if (!allowed) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { subject?: string; body?: string }
    const text = (body.body ?? '').trim()
    if (!text) return apiError('note_required', 400)
    const subject = (body.subject ?? '').trim() || null

    const { data, error } = await msgs(sb)
      .insert({
        journey_id: params.id,
        from_person_id: session.person_id,
        subject: subject ? subject.slice(0, 300) : null,
        body: text.slice(0, 4000),
      })
      .select('id, subject, body, from_person_id, created_at, read_at')
      .single()
    if (error) {
      if ((error as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      throw error
    }
    return NextResponse.json({ message: data }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    // Пометить прочитанным может ТОЛЬКО сама студентка-владелица этой journey.
    if (!isOwnStudentJourney(session, params.id)) {
      return apiError('forbidden', 403)
    }
    const sb = createServerClient()

    const body = await request.json().catch(() => ({})) as { message_id?: string }
    const messageId = (body.message_id ?? '').trim()
    if (!messageId) return apiError('note_required', 400)

    const { error } = await msgs(sb)
      .update({ read_at: new Date().toISOString() })
      .eq('id', messageId)
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
