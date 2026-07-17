import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { jsonError } from '@/lib/api/handler'
import { loadStageContext, stageSignerAuthority } from '@/lib/workflow/stage-access'
import { syncAcceptanceTasks } from '@/lib/workflow/acceptance-tasks'
import { finalCodeToStatus, setJewishnessStatus } from '@/lib/jewishness/status'
import { createNotifications } from '@/lib/notifications/create'
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

    // «После того как все закончили»: финальное утверждение с ПРИЁМОМ нельзя
    // подписать, пока направленная к врачу/психологу ещё не подписала свой этап
    // (medical / medical_psych активен). Отклонение — можно всегда.
    if ((body.final_code === 'admitted' || body.final_code === 'admitted_conditional') && ctx.journeyId) {
      const { data: activeMed } = await sb
        .from('stage_instances')
        .select('id, stage_template:stage_templates!inner(code), process_instance:process_instances!inner(journey_id)')
        .eq('process_instance.journey_id', ctx.journeyId)
        .in('stage_template.code', ['medical', 'medical_psych'])
        .eq('status', 'active')
        .limit(1)
      if (activeMed && activeMed.length > 0) {
        return apiError('medical_pending', 409)
      }
    }

    // Заметка/причина этапа (напр. причина «направить к врачу») — пишется в
    // stage_instances.notes (её читают очередь врача и панель подписей).
    const noteRaw = (body.result_data?.note ?? null) as unknown
    const note = typeof noteRaw === 'string' && noteRaw.trim() ? noteRaw.trim().slice(0, 2000) : null

    // result_data для RPC — без signature и note (обрабатываем отдельно).
    const rpcResultData: Record<string, unknown> | null = body.result_data
      ? Object.fromEntries(Object.entries(body.result_data).filter(([k]) => k !== 'signature' && k !== 'note'))
      : null

    const { data: result, error: rpcErr } = await sb.rpc('complete_stage', {
      p_stage_instance_id: params.stageInstanceId,
      p_final_code: body.final_code,
      p_actor_id: session.person_id,
      p_result_data: rpcResultData,
    })
    if (rpcErr) throw rpcErr

    // Заметка/причина этапа — сохраняем в stage_instances.notes (не трогая RPC).
    if (note) {
      const { error: noteErr } = await sb
        .from('stage_instances')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ notes: note } as any)
        .eq('id', params.stageInstanceId)
      if (noteErr) console.error('[complete] stage note update:', noteErr)
    }

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
        p_process_code: 'acceptance',
        p_journey_id: ctx.journeyId,
        p_actor_id: session.person_id,
      })
      if (admErr) console.error('[complete] авто-запуск «Приём»:', admErr)
    }

    // Синхронизация автозадач приёма (напоминание + календарь) — best-effort,
    // никогда не роняет завершение этапа. Закрывает задачу завершённого этапа
    // и создаёт задачи для только что активированных ролевых этапов.
    if (ctx.journeyId) {
      try {
        await syncAcceptanceTasks(sb, ctx.journeyId, session.person_id)
      } catch (taskErr) {
        console.error('[complete] syncAcceptanceTasks:', taskErr)
      }
    }

    // Маршрут חול: сохраняем journey_study_tracks, если track_id передан на ЛЮБОМ
    // этапе. Так «אחראי לימודים» выбирает маршрут уже на учебном этапе (academic),
    // а директор при финале может подтвердить/сменить. Best-effort и деплой-
    // безопасно (нет таблицы → пропускаем), никогда не роняет завершение этапа.
    {
      const trackId = (body.result_data?.track_id ?? null) as string | null
      if (ctx.journeyId && trackId) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: trErr } = await (sb as any)
            .from('journey_study_tracks')
            .upsert({ journey_id: ctx.journeyId, track_id: trackId, updated_by: session.person_id, updated_at: new Date().toISOString() },
              { onConflict: 'journey_id' })
          if (trErr && trErr.code !== '42P01') console.error('[complete] track upsert:', trErr)
        } catch (trCatch) {
          console.error('[complete] track upsert:', trCatch)
        }
      }
    }

    // Реверс-синк бирур-яхадут: завершение этапа 'jewishness' (approved/rejected)
    // пишет статус верификации на студентку + строку истории. Best-effort, деплой-
    // безопасно (нет колонок/таблицы → тихо пропускаем), не роняет ответ.
    if (ctx.journeyId && ctx.stageCode === 'jewishness') {
      const jStatus = finalCodeToStatus(body.final_code)
      if (jStatus) {
        try {
          await setJewishnessStatus(sb, {
            journeyId: ctx.journeyId, status: jStatus,
            changedBy: session.person_id, note, source: 'acceptance_stage',
          })
        } catch (jErr) {
          console.error('[complete] jewishness status sync:', jErr)
        }
      }
    }

    // Когда приёмная комиссия ЗАВЕРШИЛАСЬ (принята/условно/отклонена) — уведомляем
    // того, кто запустил приём (набор), результатом. Замыкает петлю обратно на
    // набор. Best-effort, никогда не роняет ответ.
    const finish = (result as CompleteStageResult).finish_reason
    if (ctx.journeyId && (finish === 'admitted' || finish === 'admitted_conditional' || finish === 'rejected')) {
      try {
        const { data: si } = await sb
          .from('stage_instances')
          .select('process_instance:process_instances(created_by)')
          .eq('id', params.stageInstanceId)
          .maybeSingle()
        const recruiterId = (si?.process_instance as unknown as { created_by: string | null } | null)?.created_by ?? null
        if (recruiterId) {
          const { data: j } = await sb
            .from('education_journeys')
            .select('person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name)')
            .eq('id', ctx.journeyId)
            .maybeSingle()
          const p = (j?.person as unknown as { full_name?: string | null; hebrew_name?: string | null } | null) ?? null
          const name = p?.full_name || p?.hebrew_name || ''
          const title = finish === 'rejected'
            ? (name ? `לא התקבלה: ${name}` : 'מועמדת לא התקבלה')
            : (name ? `התקבלה 🎉 ${name}` : 'מועמדת התקבלה 🎉')
          await createNotifications(sb, [{
            person_id: recruiterId,
            type: 'acceptance_result',
            title,
            link: `/dashboard/education/leads/${ctx.journeyId}`,
            metadata: { journey_id: ctx.journeyId, finish_reason: finish },
          }])
        }
      } catch (notifErr) {
        console.error('[complete] acceptance-result notify:', notifErr)
      }
    }

    return NextResponse.json({ ok: true, ...(result as CompleteStageResult) })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
