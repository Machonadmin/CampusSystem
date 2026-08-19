import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'
import { loadStageContext, stageSignerAuthority } from '@/lib/workflow/stage-access'
import { uploadSignatureImage } from '@/lib/workflow/signature-storage'

/**
 * POST /api/workflow/stages/[stageInstanceId]/signature/upload
 *
 * Загружает PNG рукописной подписи в приватный бакет по серверному пути
 * signatures/<stageInstanceId>/<uuid>.png и возвращает { storage_path }.
 * Гейт — тот же, что на завершение этапа (кто может подписать, тот и грузит).
 * Сама подпись фиксируется атомарно при завершении этапа (/complete).
 */
export const runtime = 'nodejs'

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024 // 2 МБ хватает для PNG подписи

export async function POST(
  request: NextRequest,
  { params }: { params: { stageInstanceId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const ctx = await loadStageContext(params.stageInstanceId)
    if (!ctx) return apiError('substage_not_found', 404)

    const authority = await stageSignerAuthority(session, ctx)
    if (!authority) return apiError('forbidden', 403)

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) return apiError('file_required', 400)
    if (file.size > MAX_SIGNATURE_BYTES) return apiError('file_too_large', 400)
    if (file.type !== 'image/png') return apiError('file_type_not_allowed', 400)

    const { storage_path } = await uploadSignatureImage(params.stageInstanceId, file)
    return NextResponse.json({ storage_path }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
