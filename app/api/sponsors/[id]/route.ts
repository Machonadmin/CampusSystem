import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireSponsorsPrivilege } from '@/lib/sponsors/permissions'
import { mapDbError } from '@/lib/sponsors/http'
import { isSponsorType } from '@/lib/sponsors/validation'
import type { SponsorUpdate } from '@/types/database'

/**
 * GET    /api/sponsors/[id] — донор по id (view).
 * PATCH  /api/sponsors/[id] — правка донора (manage): любые поля; тип — через
 *   type-guard; name не может стать пустым; is_active — boolean.
 * DELETE /api/sponsors/[id] — удаление донора (manage). Каскадно уносит его
 *   пожертвования (donations.sponsor_id ON DELETE CASCADE). Мягкая деактивация
 *   делается через PATCH is_active=false.
 */

const SPONSOR_COLS =
  'id, name, sponsor_type, email, phone, address, contact_person, notes, is_active, created_by, created_at, updated_at'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSponsorsPrivilege('view')

    const sb = createServerClient()
    const { data, error } = await sb
      .from('sponsors').select(SPONSOR_COLS).eq('id', params.id).maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Донор не найден' }, { status: 404 })

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
    await requireSponsorsPrivilege('manage')

    const body = await request.json() as {
      name?: string
      sponsor_type?: string
      email?: string | null
      phone?: string | null
      address?: string | null
      contact_person?: string | null
      notes?: string | null
      is_active?: unknown
    }

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('sponsors')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (!existing) return NextResponse.json({ error: 'Донор не найден' }, { status: 404 })

    const update: SponsorUpdate = {}

    if (body.name !== undefined) {
      const name = body.name?.trim()
      if (!name) {
        return NextResponse.json({ error: 'name не может быть пустым' }, { status: 400 })
      }
      update.name = name
    }

    if (body.sponsor_type !== undefined) {
      if (!isSponsorType(body.sponsor_type)) {
        return NextResponse.json({ error: 'Неверный тип донора' }, { status: 400 })
      }
      update.sponsor_type = body.sponsor_type
    }

    if (body.is_active !== undefined) {
      if (typeof body.is_active !== 'boolean') {
        return NextResponse.json({ error: 'is_active должен быть boolean' }, { status: 400 })
      }
      update.is_active = body.is_active
    }

    if (body.email !== undefined) update.email = body.email?.trim() || null
    if (body.phone !== undefined) update.phone = body.phone?.trim() || null
    if (body.address !== undefined) update.address = body.address?.trim() || null
    if (body.contact_person !== undefined) update.contact_person = body.contact_person?.trim() || null
    if (body.notes !== undefined) update.notes = body.notes?.trim() || null

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })
    }

    const { data, error } = await sb
      .from('sponsors')
      .update(update)
      .eq('id', params.id)
      .select(SPONSOR_COLS)
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSponsorsPrivilege('manage')

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('sponsors')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (!existing) return NextResponse.json({ error: 'Донор не найден' }, { status: 404 })

    const { error } = await sb
      .from('sponsors')
      .delete()
      .eq('id', params.id)
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
