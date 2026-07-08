import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { mapDbError } from '@/lib/calendar/http'
import { isIsoDate } from '@/lib/calendar/validation'
import type { CalendarBlockInsert } from '@/types/database'

/**
 * ЛИЧНЫЙ календарь, self-scoped: provider_id = session.person_id.
 *
 * GET  /api/calendar/blocks?from=YYYY-MM-DD&to=YYYY-MM-DD — выходные дни в
 *   диапазоне (from/to опциональны).
 * POST /api/calendar/blocks — пометить день выходным: block_date, reason?.
 *   Идемпотентно по UNIQUE (provider_id, block_date): повторная пометка того же
 *   дня возвращает существующую запись (200), а не 409.
 */

const COLS = 'id, provider_id, block_date, reason, created_by, created_at, updated_at'
const PAGE = 1000

export async function GET(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const sb = createServerClient()

    const from = request.nextUrl.searchParams.get('from')?.trim()
    const to = request.nextUrl.searchParams.get('to')?.trim()
    if (from && !isIsoDate(from)) {
      return NextResponse.json({ error: 'from должен быть датой YYYY-MM-DD' }, { status: 400 })
    }
    if (to && !isIsoDate(to)) {
      return NextResponse.json({ error: 'to должен быть датой YYYY-MM-DD' }, { status: 400 })
    }

    type Row = { id: string; block_date: string; reason: string | null }
    const rows: Row[] = []
    let offset = 0
    for (;;) {
      let q = sb
        .from('calendar_blocks')
        .select('id, block_date, reason')
        .eq('provider_id', session.person_id)
        .order('block_date', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (from) q = q.gte('block_date', from)
      if (to) q = q.lte('block_date', to)

      const { data, error } = await q
      if (error) throw error
      const page = (data ?? []) as Row[]
      rows.push(...page)
      if (page.length < PAGE) break
      offset += PAGE
    }

    return NextResponse.json({ blocks: rows })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireCalendarUser()

    const body = await request.json() as { block_date?: string; reason?: string | null }

    const blockDate = body.block_date?.trim()
    if (!blockDate || !isIsoDate(blockDate)) {
      return NextResponse.json({ error: 'block_date должен быть датой YYYY-MM-DD' }, { status: 400 })
    }

    const sb = createServerClient()

    // Идемпотентность: если день уже помечен — вернуть существующую запись.
    const { data: existing, error: exErr } = await sb
      .from('calendar_blocks')
      .select(COLS)
      .eq('provider_id', session.person_id)
      .eq('block_date', blockDate)
      .maybeSingle()
    if (exErr) throw exErr
    if (existing) return NextResponse.json(existing, { status: 200 })

    const insert: CalendarBlockInsert = {
      provider_id: session.person_id,
      block_date: blockDate,
      reason: body.reason?.trim() || null,
      created_by: session.person_id,
    }

    const { data, error } = await sb
      .from('calendar_blocks')
      .insert(insert as never)
      .select(COLS)
      .single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
