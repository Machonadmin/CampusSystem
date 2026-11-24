import { NextResponse } from 'next/server'
import { requireAuth, jsonError } from '@/lib/api/handler'
import { createServerClient } from '@/lib/supabase/server'
import { decidableCategories, requireDirectorSpaceAccess } from '@/lib/director/access'
import { loadDirectorInbox } from '@/lib/director/inbox'

/**
 * GET /api/director/inbox — «מרחב המנהל», шаг 1: всё, что сейчас ждёт
 * утверждения, по категориям (число + до 50 строк в каждой).
 * Право: המנהל (superadmin) или מזכירת המנהל (ведёт календарь superadmin) —
 * секретарь видит то же, что и המנהל (решение владельца 24.11.2026).
 * can_decide — где показывать «אשר / דחה»; кнопки шлют запрос в ТЕ ЖЕ маршруты,
 * что исходные экраны (lib/director/rules.ts → inboxActions), со своей проверкой прав.
 */
export async function GET() {
  try {
    const session = await requireAuth()
    const sb = createServerClient()
    const access = await requireDirectorSpaceAccess(sb, session)
    const [sections, canDecide] = await Promise.all([
      loadDirectorInbox(sb, access.directorIds),
      decidableCategories(session, access),
    ])
    return NextResponse.json({ role: access.role, sections, can_decide: canDecide })
  } catch (err) {
    return jsonError(err)
  }
}
