import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { getSignedUrl } from '@/lib/documents/storage'

/**
 * GET /api/workflow/signatures?journey_id=X — все подписи приёмной комиссии по
 * абитуриентке/студентке: по каждому этапу — статус, решение и кто подписал
 * (имя, роль, тип, ссылка на рисунок). Чтобы руководитель мог ясно видеть, кто
 * что утвердил, и посмотреть саму подпись — как для абитуриентки, так и позже
 * для студентки. Право: view_applicants (в любом scope) или superadmin.
 * В отличие от per-stage эндпоинта, здесь виден ВЕСЬ набор подписей (директор
 * подписывает только финал, но должен видеть подписи всех этапов).
 */

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const journeyId = request.nextUrl.searchParams.get('journey_id')?.trim()
    if (!journeyId) return apiError('journey_id_required', 400)

    const allowed = session.roles.includes('superadmin')
      || await hasEducationPrivilege(session, 'view_applicants')
    if (!allowed) return apiError('forbidden', 403)

    const sb = createServerClient()

    // Инстансы процесса acceptance для journey.
    const { data: pis } = await sb
      .from('process_instances')
      .select('id, process_template:process_templates!inner(code)')
      .eq('journey_id', journeyId)
      .eq('process_template.code', 'acceptance')
    const instanceIds = (pis ?? []).map(p => p.id)
    if (instanceIds.length === 0) {
      return NextResponse.json({ stages: [] })
    }

    // Этапы этих инстансов.
    const { data: stagesRaw } = await sb
      .from('stage_instances')
      .select(`
        id, status, final_code, completed_at, notes,
        stage_template:stage_templates!inner(code, name_ru, sort_order, required_role_code)
      `)
      .in('process_instance_id', instanceIds)
    const stages = (stagesRaw ?? []) as unknown as Array<{
      id: string
      status: string
      final_code: string | null
      completed_at: string | null
      notes: string | null
      stage_template: { code: string; name_ru: string; sort_order: number; required_role_code: string | null } | null
    }>

    // Подписи этих этапов.
    const stageIds = stages.map(s => s.id)
    const sigByStage = new Map<string, Array<{
      signer_name: string; signer_role_code: string | null; signed_via: string
      signature_kind: string; typed_name: string | null; drawing_path: string | null
      final_code: string | null; signed_at: string
    }>>()
    if (stageIds.length > 0) {
      const { data: sigs } = await sb
        .from('stage_signatures')
        .select('stage_instance_id, signer_name, signer_role_code, signed_via, signature_kind, typed_name, drawing_path, final_code, signed_at')
        .in('stage_instance_id', stageIds)
        .order('signed_at', { ascending: true })
      for (const s of (sigs ?? []) as Array<{ stage_instance_id: string } & Record<string, unknown>>) {
        const arr = sigByStage.get(s.stage_instance_id) ?? []
        arr.push(s as never)
        sigByStage.set(s.stage_instance_id, arr)
      }
    }

    // Сборка: этапы по порядку, с подписями и (для рисунка) свежей ссылкой.
    const ordered = [...stages].sort((a, b) => (a.stage_template?.sort_order ?? 0) - (b.stage_template?.sort_order ?? 0))
    const result = []
    for (const st of ordered) {
      // Роль-гейт есть только у этапов приёма; чисто информационные (без роли и без
      // подписей) не показываем как «требующие подписи».
      const rawSigs = sigByStage.get(st.id) ?? []
      const signatures = []
      for (const sig of rawSigs) {
        let image_url: string | null = null
        if (sig.signature_kind === 'drawn' && sig.drawing_path) {
          try { image_url = await getSignedUrl(sig.drawing_path) } catch { image_url = null }
        }
        signatures.push({
          signer_name: sig.signer_name,
          signer_role_code: sig.signer_role_code,
          signed_via: sig.signed_via,
          signature_kind: sig.signature_kind,
          typed_name: sig.typed_name,
          image_url,
          final_code: sig.final_code,
          signed_at: sig.signed_at,
        })
      }
      result.push({
        stage_instance_id: st.id,
        stage_code: st.stage_template?.code ?? '',
        stage_name: st.stage_template?.name_ru ?? '',
        required_role_code: st.stage_template?.required_role_code ?? null,
        status: st.status,
        final_code: st.final_code,
        completed_at: st.completed_at,
        note: st.notes ?? null,
        signatures,
      })
    }

    return NextResponse.json({ stages: result })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
