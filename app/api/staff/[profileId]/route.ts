import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

async function guard() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { profileId: string } }
) {
  try {
    await guard()
    const sb = createServerClient()

    const { data: profile, error: profileErr } = await sb
      .from('staff_profiles')
      .select('person_id')
      .eq('id', params.profileId)
      .single()

    if (profileErr || !profile) {
      return NextResponse.json({ error: 'Сотрудник не найден' }, { status: 404 })
    }

    const today = new Date().toISOString().split('T')[0]
    const { error: updateErr } = await sb
      .from('staff_positions')
      .update({ end_date: today })
      .eq('person_id', profile.person_id)
      .is('end_date', null)
    if (updateErr) throw updateErr

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
