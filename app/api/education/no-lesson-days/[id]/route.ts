import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'

/**
 * DELETE /api/education/no-lesson-days/[id] — убрать день без уроков. Право:
 * manage_class_groups в scope дня ('all' → нужен scope='all'; иначе — в
 * подразделении дня).
 */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = createServerClient()
    const { data: row, error: rErr } = await sb
      .from('academic_no_lesson_days').select('scope').eq('id', params.id).maybeSingle()
    if (rErr) {
      if (rErr.code === '42P01') return apiError('record_not_found', 404)
      throw rErr
    }
    if (!row) return apiError('record_not_found', 404)
    const scope = (row as { scope: string }).scope
    if (scope === 'all') await requireEducationPrivilege('manage_class_groups')
    else await requireEducationPrivilege('manage_class_groups', { department_id: scope })

    const { error } = await sb.from('academic_no_lesson_days').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
