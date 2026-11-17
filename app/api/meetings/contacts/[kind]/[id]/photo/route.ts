import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { errorResponse } from '@/lib/api/handler'
import { DOCUMENTS_BUCKET } from '@/lib/documents/storage'
import { PHOTO_MIME_TYPES } from '@/lib/persons/profile-photos'
import { db } from '@/lib/meetings/access'
import { isUuid } from '@/lib/meetings/rules'
import { isContactKind, type ContactKind } from '@/lib/meetings/contacts'
import { addressBookAccess, contactAccess } from '@/lib/meetings/contacts-server'

/**
 * POST   (multipart: file) — фото контакта в ספר אנשי קשר (png/jpeg/webp, до 5 МБ).
 * DELETE — убрать фото.
 * Может המנהל и מזכירת המנהל; личный контакт — только его владелец.
 * Файл — приватный бакет documents, путь address-book/<kind>/<id>/….
 */

const MAX_PHOTO_BYTES = 5 * 1024 * 1024
type Params = { params: Promise<{ kind: string; id: string }> }

async function gate(props: Params) {
  const { kind, id } = await props.params
  if (!isContactKind(kind) || !isUuid(id)) return { err: apiError('record_not_found', 404) }
  const session = await requireCalendarUser()
  const sb = createServerClient()
  const acc = await addressBookAccess(sb, session)
  const access = await contactAccess(sb, session, acc, kind as ContactKind, id)
  if (!access) return { err: apiError('record_not_found', 404) }
  if (access.kind === 'private' && access.level !== 'owner') return { err: apiError('forbidden', 403) }
  const { data: cur } = await db(sb).from('address_book_photos').select('storage_path').eq('kind', kind).eq('ref_id', id).maybeSingle()
  return { sb, session, kind, id, oldPath: (cur as { storage_path: string } | null)?.storage_path ?? null }
}

export async function POST(request: NextRequest, props: Params) {
  try {
    const g = await gate(props)
    if ('err' in g) return g.err
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) return apiError('file_required', 400)
    if (file.size > MAX_PHOTO_BYTES) return apiError('file_too_large', 400)
    if (!(PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) return apiError('file_type_not_allowed', 400)

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `address-book/${g.kind}/${g.id}/${randomUUID()}.${ext}`
    const { error: upErr } = await g.sb.storage.from(DOCUMENTS_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type, upsert: false,
    })
    if (upErr) throw Object.assign(new Error(upErr.message), { status: 500 })

    const { error } = await db(g.sb).from('address_book_photos').upsert({
      kind: g.kind, ref_id: g.id, storage_path: path, mime_type: file.type,
      updated_by: g.session.person_id, updated_at: new Date().toISOString(),
    }, { onConflict: 'kind,ref_id' })
    if (error) throw error
    if (g.oldPath) {
      const { error: sErr } = await g.sb.storage.from(DOCUMENTS_BUCKET).remove([g.oldPath])
      if (sErr) console.error('[contacts] old photo remove:', sErr)
    }
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function DELETE(_req: NextRequest, props: Params) {
  try {
    const g = await gate(props)
    if ('err' in g) return g.err
    if (!g.oldPath) return NextResponse.json({ ok: true })
    const { error } = await db(g.sb).from('address_book_photos').delete().eq('kind', g.kind).eq('ref_id', g.id)
    if (error) throw error
    const { error: sErr } = await g.sb.storage.from(DOCUMENTS_BUCKET).remove([g.oldPath])
    if (sErr) console.error('[contacts] photo remove:', sErr)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
