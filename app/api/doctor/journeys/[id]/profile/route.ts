import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireDoctorPrivilege } from '@/lib/doctor/permissions'
import { mapDbError } from '@/lib/doctor/http'
import type { MedicalProfileInsert } from '@/types/database'

/**
 * GET /api/doctor/journeys/[id]/profile — медкарта студента (view). null, если
 *   профиля ещё нет.
 * PUT /api/doctor/journeys/[id]/profile — создать/обновить медкарту (manage).
 *   Одна карта на journey (UNIQUE journey_id) — upsert по journey_id.
 *   ЧУВСТВИТЕЛЬНЫЕ ДАННЫЕ.
 */

const PROFILE_COLS =
  'id, journey_id, blood_type, chronic_conditions, allergies, medications, emergency_contact, notes, created_at, updated_at'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireDoctorPrivilege('view')

    const sb = createServerClient()

    const { data, error } = await sb
      .from('medical_profiles')
      .select(PROFILE_COLS)
      .eq('journey_id', params.id)
      .maybeSingle()
    if (error) throw error

    return NextResponse.json({ profile: data ?? null })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireDoctorPrivilege('manage')

    const body = await request.json() as {
      blood_type?: string | null
      chronic_conditions?: string | null
      allergies?: string | null
      medications?: string | null
      emergency_contact?: string | null
      notes?: string | null
    }

    const sb = createServerClient()

    const { data: journey, error: jErr } = await sb
      .from('education_journeys').select('id').eq('id', params.id).maybeSingle()
    if (jErr) throw jErr
    if (!journey) return NextResponse.json({ error: 'Студент не найден' }, { status: 400 })

    const payload: MedicalProfileInsert = {
      journey_id: params.id,
      blood_type: body.blood_type?.trim() || null,
      chronic_conditions: body.chronic_conditions?.trim() || null,
      allergies: body.allergies?.trim() || null,
      medications: body.medications?.trim() || null,
      emergency_contact: body.emergency_contact?.trim() || null,
      notes: body.notes?.trim() || null,
    }

    const { data, error } = await sb
      .from('medical_profiles')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(payload as any, { onConflict: 'journey_id' })
      .select(PROFILE_COLS)
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
