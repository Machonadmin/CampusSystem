import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { getCookieLocale } from '@/lib/i18n/locale'
import { requireDataSecurityPrivilege } from '@/lib/data-security/permissions'
import { loadPrivilegeHolders } from '@/lib/data-security/load'
import { errorResponse } from '@/lib/api/handler'

/**
 * Кто сейчас держит конкретное право — для карточки права на общем экране.
 *
 * Отвечает подписями должностей и именами людей, а не техническими кодами:
 * администратор решает «кому это открыто», и список кодов ему не помогает.
 */
export async function GET(request: NextRequest) {
  try {
    await requireDataSecurityPrivilege('access')
    // Имя 'module' занято бандлером Next — отсюда moduleCode.
    const moduleCode = request.nextUrl.searchParams.get('module')
    const code = request.nextUrl.searchParams.get('code')
    if (!moduleCode || !code) return apiError('invalid_reference', 400)
    return NextResponse.json(await loadPrivilegeHolders(moduleCode, code, getCookieLocale()))
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
