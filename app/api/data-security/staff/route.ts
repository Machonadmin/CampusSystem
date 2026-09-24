import { NextResponse } from 'next/server'
import { getCookieLocale } from '@/lib/i18n/locale'
import { requireDataSecurityPrivilege } from '@/lib/data-security/permissions'
import { loadStaffList } from '@/lib/data-security/load'
import { errorResponse } from '@/lib/api/handler'

/**
 * Список сотрудников для левой колонки экрана «по сотруднику».
 * Только те, у кого есть учётная запись: у остальных прав быть не может.
 */
export async function GET() {
  try {
    await requireDataSecurityPrivilege('access')
    return NextResponse.json(await loadStaffList(getCookieLocale()))
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
