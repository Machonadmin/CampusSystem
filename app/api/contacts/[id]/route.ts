import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireContactsPrivilege } from '@/lib/contacts/permissions'
import { mapDbError } from '@/lib/contacts/http'
import { isContactType, isContactCategory } from '@/lib/contacts/validation'
import { isValidEmail } from '@/lib/contacts/directory'
import type { ContactUpdate } from '@/types/database'

/**
 * GET    /api/contacts/[id] — контакт по id (view).
 * PATCH  /api/contacts/[id] — правка контакта (manage): любые поля; email
 *   валидируется isValidEmail (null/'' → очистить); тип/категория — через
 *   type-guards; name не может стать пустым; is_active — boolean.
 * DELETE /api/contacts/[id] — удаление контакта (manage). Мягкая деактивация
 *   делается через PATCH is_active=false.
 */

const CONTACT_COLS =
  'id, name, contact_type, category, email, phone, address, website, contact_person, notes, is_active, created_by, created_at, updated_at'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireContactsPrivilege('view')

    const sb = createServerClient()
    const { data, error } = await sb
      .from('contacts').select(CONTACT_COLS).eq('id', params.id).maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Контакт не найден' }, { status: 404 })

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
    await requireContactsPrivilege('manage')

    const body = await request.json() as {
      name?: string
      contact_type?: string
      category?: string
      email?: string | null
      phone?: string | null
      address?: string | null
      website?: string | null
      contact_person?: string | null
      notes?: string | null
      is_active?: unknown
    }

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('contacts')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (!existing) return NextResponse.json({ error: 'Контакт не найден' }, { status: 404 })

    const update: ContactUpdate = {}

    if (body.name !== undefined) {
      const name = body.name?.trim()
      if (!name) {
        return NextResponse.json({ error: 'name не может быть пустым' }, { status: 400 })
      }
      update.name = name
    }

    if (body.contact_type !== undefined) {
      if (!isContactType(body.contact_type)) {
        return NextResponse.json({ error: 'Неверный тип контакта' }, { status: 400 })
      }
      update.contact_type = body.contact_type
    }

    if (body.category !== undefined) {
      if (!isContactCategory(body.category)) {
        return NextResponse.json({ error: 'Неверная категория' }, { status: 400 })
      }
      update.category = body.category
    }

    // email: null/'' → очистить; строка → валидировать и установить.
    if (body.email !== undefined) {
      if (body.email === null || body.email === '') {
        update.email = null
      } else {
        const email = body.email.trim()
        if (!isValidEmail(email)) {
          return NextResponse.json({ error: 'Неверный email' }, { status: 400 })
        }
        update.email = email
      }
    }

    if (body.is_active !== undefined) {
      if (typeof body.is_active !== 'boolean') {
        return NextResponse.json({ error: 'is_active должен быть boolean' }, { status: 400 })
      }
      update.is_active = body.is_active
    }

    if (body.phone !== undefined) update.phone = body.phone?.trim() || null
    if (body.address !== undefined) update.address = body.address?.trim() || null
    if (body.website !== undefined) update.website = body.website?.trim() || null
    if (body.contact_person !== undefined) update.contact_person = body.contact_person?.trim() || null
    if (body.notes !== undefined) update.notes = body.notes?.trim() || null

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })
    }

    const { data, error } = await sb
      .from('contacts')
      .update(update)
      .eq('id', params.id)
      .select(CONTACT_COLS)
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
    await requireContactsPrivilege('manage')

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('contacts')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (!existing) return NextResponse.json({ error: 'Контакт не найден' }, { status: 404 })

    const { error } = await sb
      .from('contacts')
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
