import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { requirePrivilege } from '@/lib/auth/module-privileges'
import { parseBody, jsonError } from '@/lib/api/handler'

type Params = { params: { personId: string } }

/**
 * GET /api/documents/person/[personId]
 * Returns person_documents with document_type info.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requirePrivilege('documents', 'view')

    const sb = createServerClient()
    const { data, error } = await sb
      .from('person_documents')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select('id, document_type_id, status, file_url, notes, received_at, verified_at, created_at, updated_at' as any)
      .eq('person_id', params.personId)
    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (err: unknown) {
    return jsonError(err)
  }
}

const personDocumentSchema = z.object({
  document_type_id: z.string().uuid(),
  status: z.enum(['pending', 'received', 'verified', 'rejected', 'expired']),
  notes: z.string().optional(),
})

/**
 * POST /api/documents/person/[personId]
 * Body: { document_type_id, status, notes? }
 * Upserts the record (inserts or updates status/notes).
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await requirePrivilege('documents', 'create')
    const body = await parseBody(req, personDocumentSchema)

    const now = new Date().toISOString()
    const sb = createServerClient()

    const received_at = body.status === 'received' || body.status === 'verified' ? now : null
    const received_by = body.status === 'received' || body.status === 'verified' ? session.person_id : null
    const verified_at = body.status === 'verified' ? now : null
    const verified_by = body.status === 'verified' ? session.person_id : null

    // Check if record already exists
    const { data: existing } = await sb
      .from('person_documents')
      .select('id, received_at, received_by')
      .eq('person_id', params.personId)
      .eq('document_type_id', body.document_type_id)
      .maybeSingle()

    if (existing) {
      const updateData: Record<string, unknown> = {
        status: body.status,
        notes: body.notes ?? null,
        updated_at: now,
      }
      if (body.status === 'verified') {
        updateData.verified_at = now
        updateData.verified_by = session.person_id
        // preserve received_at if it was already set
        if (!existing.received_at) {
          updateData.received_at = now
          updateData.received_by = session.person_id
        }
      } else if (body.status === 'received') {
        updateData.received_at = now
        updateData.received_by = session.person_id
        updateData.verified_at = null
        updateData.verified_by = null
      } else {
        updateData.verified_at = null
        updateData.verified_by = null
      }

      const { error } = await sb
        .from('person_documents')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(updateData as any)
        .eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await sb
        .from('person_documents')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          person_id: params.personId,
          document_type_id: body.document_type_id,
          status: body.status,
          notes: body.notes ?? null,
          received_at,
          received_by,
          verified_at,
          verified_by,
        } as any)
      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
