import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireFoodPrivilege } from '@/lib/food/permissions'
import { mapDbError } from '@/lib/food/http'
import type { DietaryProfileInsert } from '@/types/database'

/**
 * GET /api/food/journeys/[id]/dietary — диет-профиль студента (view). null,
 *   если профиля нет.
 * PUT /api/food/journeys/[id]/dietary — создать/обновить профиль (manage).
 *   Один профиль на journey (UNIQUE journey_id) — upsert по journey_id.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireFoodPrivilege('view')

    const sb = createServerClient()

    const { data, error } = await sb
      .from('dietary_profiles')
      .select('id, journey_id, restrictions, allergies, notes, created_at, updated_at')
      .eq('journey_id', params.id)
      .maybeSingle()
    if (error) throw error

    return NextResponse.json({ dietary: data ?? null })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireFoodPrivilege('manage')

    const body = await request.json() as {
      restrictions?: string | null
      allergies?: string | null
      notes?: string | null
    }

    const sb = createServerClient()

    const { data: journey, error: jErr } = await sb
      .from('education_journeys').select('id').eq('id', params.id).maybeSingle()
    if (jErr) throw jErr
    if (!journey) return apiError('student_not_found', 400)

    const payload: DietaryProfileInsert = {
      journey_id: params.id,
      restrictions: body.restrictions?.trim() || null,
      allergies: body.allergies?.trim() || null,
      notes: body.notes?.trim() || null,
    }

    const { data, error } = await sb
      .from('dietary_profiles')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(payload as any, { onConflict: 'journey_id' })
      .select('*')
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
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
