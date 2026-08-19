import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { loadStageContext, stageSignerAuthority } from '@/lib/workflow/stage-access'
import { getSignedUrl } from '@/lib/documents/storage'

/**
 * GET /api/workflow/stages/[stageInstanceId]/signature
 *
 * Последняя (по signed_at) подпись этапа для отображения. Для рисунка отдаётся
 * свежая подписанная ссылка (5 мин) — сырой путь наружу не уходит. Гейт — тот
 * же, что на завершение/подпись этапа.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { stageInstanceId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const ctx = await loadStageContext(params.stageInstanceId)
    if (!ctx) return apiError('substage_not_found', 404)

    const authority = await stageSignerAuthority(session, ctx)
    if (!authority) return apiError('forbidden', 403)

    const sb = createServerClient()
    const { data: sig, error } = await sb
      .from('stage_signatures')
      .select('id, signer_name, signer_role_code, signed_via, signature_kind, typed_name, drawing_path, final_code, signed_at')
      .eq('stage_instance_id', params.stageInstanceId)
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!sig) return NextResponse.json({ signature: null })

    let image_url: string | null = null
    if (sig.signature_kind === 'drawn' && sig.drawing_path) {
      image_url = await getSignedUrl(sig.drawing_path)
    }

    // Сырой drawing_path наружу не отдаём — только подписанную ссылку.
    const { drawing_path: _omit, ...safe } = sig
    void _omit
    return NextResponse.json({ signature: { ...safe, image_url } })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
