import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requirePrivilege } from '@/lib/auth/module-privileges'
import { hasDataSecurityPrivilege } from '@/lib/data-security/permissions'
import { errorResponse } from '@/lib/api/handler'

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    // Изменение штатной позиции (должность, глава отдела, дата увольнения) —
    // административное действие над HR-данными. Гейт как у остального модуля
    // staff: persons.edit (create → persons.create, увольнение → persons.delete).
    await requirePrivilege('persons', 'edit')
    const sb = createServerClient()
    const { data: current, error: curErr } = await sb.from('staff_positions')
      .select('person_id, department_id, end_date').eq('id', params.id).maybeSingle()
    if (curErr) throw curErr
    if (!current) return apiError('not_found', 404)
    const cur = current as { person_id: string; department_id: string | null; end_date: string | null }
    // Право — в подразделении ЭТОЙ позиции (а не «где-нибудь»).
    const session = await requirePrivilege('persons', 'edit', { department_id: cur.department_id ?? undefined })
    const isSuper = session.roles.includes('superadmin')
    // Свою позицию не меняют (red-team 2026-09-25: сотрудник HR назначал себя
    // главой юнита через is_head и затем выдавал себе права).
    if (!isSuper && cur.person_id === session.person_id) return apiError('cannot_edit_own_position', 403)

    const body = await request.json() as {
      position_ru?: string
      position_id?: string | null
      employment_type?: string
      is_head?: boolean
      end_date?: string | null
    }

    const update: Record<string, unknown> = {}

    if (body.position_id !== undefined) {
      if (body.position_id) {
        const { data: refPos } = await sb
          .from('reference_positions')
          .select('name_ru')
          .eq('id', body.position_id)
          .maybeSingle()
        if (!refPos) return apiError('position_not_found', 400)
        update.position_id = body.position_id
        update.position_ru = refPos.name_ru
      } else {
        update.position_id = null
      }
    } else if (body.position_ru !== undefined) {
      update.position_ru = body.position_ru
    }

    if (body.employment_type !== undefined) update.employment_type = body.employment_type
    // Глава юнита открывает управление правами членов юнита — это решение
    // уровня безопасности данных, а не кадровая правка: только superadmin или
    // data_security.manage_units (как в /api/staff/seat).
    if (body.is_head !== undefined) {
      if (!isSuper && !(await hasDataSecurityPrivilege(session, 'manage_units'))) return apiError('forbidden', 403)
      update.is_head = body.is_head === true
    }
    // Дата окончания = увольнение с позиции → persons.delete в подразделении позиции.
    if (body.end_date !== undefined && (body.end_date ?? null) !== cur.end_date) {
      await requirePrivilege('persons', 'delete', { department_id: cur.department_id ?? undefined })
      update.end_date = body.end_date
    }
    if (Object.keys(update).length === 0) return apiError('no_changes', 400)

    const { error } = await sb.from('staff_positions').update(update).eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
