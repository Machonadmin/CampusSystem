import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requirePsychologistPrivilege } from '@/lib/psychologist/permissions'
import { mapDbError } from '@/lib/psychologist/http'
import { isIsoDate, isSessionStatus, isSessionType } from '@/lib/psychologist/validation'
import { canTransitionSession } from '@/lib/psychologist/counseling'
import type { PsychSessionUpdate } from '@/types/database'

/**
 * GET   /api/psychologist/sessions/[id] — консультация по id (view).
 * PATCH /api/psychologist/sessions/[id] — правка консультации (manage): поля,
 *   установка/очистка follow_up_date (null → очистить), смена статуса через
 *   canTransitionSession (open↔closed) — 409 на недопустимом переходе.
 *   ЧУВСТВИТЕЛЬНЫЕ ДАННЫЕ.
 */

const SESSION_COLS =
  'id, journey_id, session_date, session_type, summary, follow_up_date, status, counselor_id, created_by, created_at, updated_at'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requirePsychologistPrivilege('view')

    const sb = createServerClient()
    const { data, error } = await sb
      .from('psych_sessions').select(SESSION_COLS).eq('id', params.id).maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Консультация не найдена' }, { status: 404 })

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requirePsychologistPrivilege('manage')

    const body = await request.json() as {
      session_date?: string
      session_type?: string
      summary?: string | null
      follow_up_date?: string | null
      status?: string
    }

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('psych_sessions')
      .select('id, status')
      .eq('id', params.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (!existing) return NextResponse.json({ error: 'Консультация не найдена' }, { status: 404 })

    const update: PsychSessionUpdate = {}

    if (body.status !== undefined) {
      if (!isSessionStatus(body.status)) {
        return NextResponse.json({ error: 'Неверный статус' }, { status: 400 })
      }
      if (!canTransitionSession(existing.status, body.status)) {
        return NextResponse.json(
          { error: `Недопустимый переход статуса: ${existing.status} → ${body.status}` },
          { status: 409 },
        )
      }
      update.status = body.status
    }

    if (body.session_date !== undefined) {
      const sd = body.session_date?.trim()
      if (!sd || !isIsoDate(sd)) {
        return NextResponse.json({ error: 'session_date должен быть датой YYYY-MM-DD' }, { status: 400 })
      }
      update.session_date = sd
    }

    if (body.session_type !== undefined) {
      if (!isSessionType(body.session_type)) {
        return NextResponse.json({ error: 'Неверный тип консультации' }, { status: 400 })
      }
      update.session_type = body.session_type
    }

    // follow_up_date: null/'' → очистить; строка → валидировать и установить.
    if (body.follow_up_date !== undefined) {
      if (body.follow_up_date === null || body.follow_up_date === '') {
        update.follow_up_date = null
      } else {
        const fu = body.follow_up_date.trim()
        if (!isIsoDate(fu)) {
          return NextResponse.json({ error: 'follow_up_date должен быть датой YYYY-MM-DD' }, { status: 400 })
        }
        update.follow_up_date = fu
      }
    }

    if (body.summary !== undefined) update.summary = body.summary?.trim() || null

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })
    }

    const { data, error } = await sb
      .from('psych_sessions')
      .update(update)
      .eq('id', params.id)
      .select(SESSION_COLS)
      .single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
