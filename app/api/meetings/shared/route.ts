import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireModuleUser } from '@/lib/modules/personal-access'
import { errorResponse } from '@/lib/api/handler'
import { isMissingTable } from '@/lib/supabase/errors'
import { db, personNames } from '@/lib/meetings/access'

/**
 * GET /api/meetings/shared — что владельцы встреч передали МНЕ. Только
 * переданный текст + тема и дата встречи; остальное содержание не отдаётся.
 * При чтении отмечает переданное прочитанным.
 */
export async function GET() {
  try {
    const session = await requireModuleUser('meetings')
    const sb = createServerClient()
    const { data, error } = await db(sb).from('appointment_shares')
      .select('id, appointment_id, content, created_by, created_at, read_at')
      .eq('recipient_id', session.person_id).order('created_at', { ascending: false }).limit(200)
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ shares: [] })
      throw error
    }
    const rows = (data ?? []) as Array<{ id: string; appointment_id: string; content: string; created_by: string | null; created_at: string; read_at: string | null }>
    const apptIds = [...new Set(rows.map(r => r.appointment_id))]
    const meta = new Map<string, { title: string; starts_at: string }>()
    if (apptIds.length > 0) {
      const { data: appts } = await db(sb).from('appointments').select('id, title, starts_at').in('id', apptIds)
      for (const a of (appts ?? []) as Array<{ id: string; title: string; starts_at: string }>) meta.set(a.id, a)
    }
    const names = await personNames(sb, rows.map(r => r.created_by))

    const unread = rows.filter(r => !r.read_at).map(r => r.id)
    if (unread.length > 0) {
      const { error: uErr } = await db(sb).from('appointment_shares').update({ read_at: new Date().toISOString() }).in('id', unread)
      if (uErr) console.error('[meetings] shares read_at:', uErr)
    }

    return NextResponse.json({
      shares: rows.map(r => ({
        id: r.id,
        content: r.content,
        created_at: r.created_at,
        unread: !r.read_at,
        from_name: r.created_by ? names.get(r.created_by) ?? '' : '',
        meeting_title: meta.get(r.appointment_id)?.title ?? '',
        meeting_starts_at: meta.get(r.appointment_id)?.starts_at ?? null,
      })),
    })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
