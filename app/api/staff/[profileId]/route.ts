import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requirePrivilege } from '@/lib/auth/module-privileges'
import { jsonError } from '@/lib/api/handler'

/**
 * DELETE /api/staff/[profileId] — увольнение (end_date на staff_positions).
 * Право: persons.delete (сейчас scope=all только superadmin/tech_admin —
 * см. 20260702140000_persons_documents_privileges.sql, п.5).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { profileId: string } }
) {
  try {
    await requirePrivilege('persons', 'delete')
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
    return jsonError(err)
  }
}
