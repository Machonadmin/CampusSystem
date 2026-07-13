import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { jsonError } from '@/lib/api/handler'
import { loadStageContext, stageSignerAuthority } from '@/lib/workflow/stage-access'
import { getSignatureMethod } from '@/lib/settings/app-settings'
import { validateSignature, type ValidSignature } from '@/lib/workflow/signature'
import { signatureImageExists } from '@/lib/workflow/signature-storage'

interface CompleteStageResult {
  stage_instance_id: string
  activated_stage_ids: string[]
  process_completed: boolean
  finish_reason: string | null
}

/**
 * POST /api/workflow/stages/[stageInstanceId]/complete
 *
 * Завершение подэтапа + продвижение процесса — атомарно через RPC complete_stage.
 * Дополнительно: если этап требует подпись (stage_templates.requires_signature)
 * или подпись передана — она ВАЛИДИРУЕТСЯ на сервере и записывается в
 * stage_signatures с личностью из сессии (никогда из тела запроса).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { stageInstanceId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const body = await request.json() as {
      final_code: string
      result_data?: Record<string, unknown>
    }
    if (!body.final_code) return apiError('final_code_required', 400)

    const ctx = await loadStageContext(params.stageInstanceId)
    if (!ctx) return apiError('substage_not_found', 404)

    // Права: ролевой этап → своя роль или управленец (override); иначе — manage_leads (как раньше).
    const authority = await stageSignerAuthority(session, ctx)
    if (!authority) return apiError('forbidden', 403)

    const target = ctx.departmentId ? { department_id: ctx.departmentId } : undefined
    if (body.final_code === 'convert_to_applicant') {
      await requireEducationPrivilege('convert_lead', target)
    }

    // ── Подпись: валидация ДО завершения ──────────────────────────────────
    const sigRaw = (body.result_data?.signature ?? null) as unknown
    let validSig: ValidSignature | null = null
    if (ctx.requiresSignature || sigRaw != null) {
      const method = await getSignatureMethod()
      const v = validateSignature(sigRaw as never, {
        method,
        signerFullName: session.full_name,
        stageInstanceId: params.stageInstanceId,
      })
      if ('error' in v) return apiError(v.error, 400)
      if (v.ok.kind === 'drawn' && v.ok.drawing_path) {
        const exists = await signatureImageExists(params.stageInstanceId, v.ok.drawing_path)
        if (!exists) return apiError('invalid_drawing_path', 400)
      }
      validSig = v.ok
    }

    const sb = createServerClient()

    // result_data для RPC — без объекта signature (авторитетная подпись пишется отдельно).
    const rpcResultData: Record<string, unknown> | null = body.result_data
      ? Object.fromEntries(Object.entries(body.result_data).filter(([k]) => k !== 'signature'))
      : null

    const { data: result, error: rpcErr } = await sb.rpc('complete_stage', {
      p_stage_instance_id: params.stageInstanceId,
      p_final_code: body.final_code,
      p_actor_id: session.person_id,
      p_result_data: rpcResultData,
    })
    if (rpcErr) throw rpcErr

    // Подпись фиксируем ПОСЛЕ успешного завершения — личность строго из сессии.
    if (validSig) {
      const signerName = session.full_name?.trim() || session.login_email || 'unknown'
      const { error: sigErr } = await sb
        .from('stage_signatures')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          stage_instance_id: params.stageInstanceId,
          signed_by: session.person_id,
          signer_name: signerName,
          signer_role_code: ctx.requiredRoleCode,
          signed_via: authority,
          signature_kind: validSig.kind,
          typed_name: validSig.typed_name,
          drawing_path: validSig.drawing_path,
          final_code: body.final_code,
          metadata: validSig.metadata,
        } as any)
      if (sigErr) {
        return NextResponse.json(
          { error: serverT('signature_record_failed'), code: 'signature_record_failed' },
          { status: 500 },
        )
      }
    }

    // Автозапуск процесса «Приём» при переходе лида в абитуриенты (best-effort, идемпотентно).
    if ((result as CompleteStageResult).finish_reason === 'converted' && ctx.journeyId) {
      const { error: admErr } = await sb.rpc('start_process', {
        p_process_code: 'admission',
        p_journey_id: ctx.journeyId,
        p_actor_id: session.person_id,
      })
      if (admErr) console.error('[complete] авто-запуск «Приём»:', admErr)
    }

    return NextResponse.json({ ok: true, ...(result as CompleteStageResult) })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
