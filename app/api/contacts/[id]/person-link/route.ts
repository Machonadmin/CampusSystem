import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireContactsPrivilege } from '@/lib/contacts/permissions'
import { mapDbError } from '@/lib/contacts/http'
import { applyPersonLinkAction, canViewPersonsSafe, isPersonLinkAction } from '@/lib/persons/record-link'
import { errorResponse } from '@/lib/api/handler'

/**
 * POST /api/contacts/[id]/person-link — решение ответственного (contacts.manage)
 * по связи контакта с центральной персоной (решение №11).
 * Тело: { action: 'confirm' | 'reject' | 'unlink' }.
 *   confirm — «возможное совпадение» подтверждено → linked;
 *   reject  — «не тот же человек» → rejected;
 *   unlink  — снять существующую связь → rejected.
 * Ответ: { person_link } — о кандидате только имя + маска телефона.
 * 409 state_conflict — действие не подходит к текущему статусу;
 * 503 feature_not_migrated — миграция 20260925000000 ещё не применена.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await requireContactsPrivilege('manage')

    let body: { action?: unknown } = {}
    try {
      body = await request.json() as { action?: unknown }
    } catch {
      body = {}
    }
    if (!isPersonLinkAction(body.action)) return apiError('invalid_field_value', 400)

    const sb = createServerClient()
    const res = await applyPersonLinkAction(sb, 'contacts', params.id, body.action, {
      canManage: true,
      canViewPersons: await canViewPersonsSafe(session),
    })
    if ('view' in res) return NextResponse.json({ person_link: res.view })
    if (res.error === 'not_found') return apiError('contact_not_found', 404)
    if (res.error === 'state_conflict') return apiError('state_conflict', 409)
    if (res.error === 'not_migrated') return apiError('feature_not_migrated', 503)
    return errorResponse(mapDbError(res.dbError ?? {}))
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) return errorResponse(mapDbError(e))
    return errorResponse(e)
  }
}
