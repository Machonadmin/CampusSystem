import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

async function guard() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

export async function PATCH(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await guard()
    const sb = createServerClient()

    const { data: profile, error } = await sb
      .from('applicant_profiles')
      .update({ education_status: 'applicant' })
      .eq('id', params.id)
      .eq('education_status', 'lead')
      .select('person_id')
      .single()

    if (error || !profile) {
      return NextResponse.json({ error: 'Лид не найден или уже переведён' }, { status: 404 })
    }

    await Promise.all([
      sb.from('persons')
        .update({ education_status: 'applicant' })
        .eq('id', profile.person_id),
      sb.from('person_status_history').insert({
        person_id: profile.person_id,
        from_status: 'lead',
        to_status: 'applicant',
        changed_by: session.person_id,
      }),
    ])

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
