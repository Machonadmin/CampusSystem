import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'
import { canManageStudentFinance } from '@/lib/finance/access'
import { uploadFinanceSignatureImage } from '@/lib/workflow/signature-storage'
import { errorResponse } from '@/lib/api/handler'

/**
 * POST /api/finance/journeys/[id]/signature/upload
 *
 * Загружает PNG рукописной подписи для финансовой операции (платёж / скидка)
 * этой студентки по серверному пути signatures/finance/<journeyId>/<uuid>.png
 * и возвращает { storage_path }. Гейт — тот же, что на запись платежа/скидки
 * (canManageStudentFinance). Сама подпись (кто/когда) фиксируется при записи
 * платежа/скидки — личность из сессии, не из тела.
 */
export const runtime = 'nodejs'

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageStudentFinance(session, params.id))) return apiError('forbidden', 403)

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) return apiError('file_required', 400)
    if (file.size > MAX_SIGNATURE_BYTES) return apiError('file_too_large', 400)
    if (file.type !== 'image/png') return apiError('file_type_not_allowed', 400)

    const { storage_path } = await uploadFinanceSignatureImage(params.id, file)
    return NextResponse.json({ storage_path }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
