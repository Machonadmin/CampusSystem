import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { getSignatureMethod } from '@/lib/settings/app-settings'

/**
 * GET /api/psychologist/referrals — очередь «Направленные к психологу» (מטופלות).
 *
 * Возвращает всех абитуриенток, у которых АКТИВЕН этап `medical_psych` процесса
 * «Приёмная комиссия» (т.е. её направили refer_to_psychologist). По каждой — ВСЁ,
 * что нужно психологу для заключения:
 *   • личные данные (persons),
 *   • кто направил и почему (родственные завершённые этапы с финалом
 *     refer_to_psychologist + их заметка + подписант),
 *   • загруженные документы (document_records),
 *   • прошлые псих-данные, если есть (psych_profiles / psych_sessions).
 * Плюс stage_instance_id + финалы этапа `medical_psych` + метод подписи — чтобы
 * подписать заключение прямо из очереди (через общий /api/workflow/.../complete).
 *
 * Доступ: носитель роли, подписывающей этап medical_psych (psychologist),
 * либо superadmin. Модуль образования при этом НЕ требуется — психолог не
 * получает доступ к лидам, только к своей очереди.
 *
 * Deploy-safe: psych_profiles/psych_sessions могут отсутствовать в свежей БД —
 * их ошибка (в т.ч. 42P01) НЕ бросается (деструктурируем только data), поэтому
 * блок деградирует до пустых значений, а не роняет ответ.
 */

const PSYCH_SIGNER_ROLES = ['psychologist', 'superadmin']

function flattenPhones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(p => (typeof p === 'string' ? p : (p as { number?: string })?.number ?? ''))
    .filter(Boolean)
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: serverT('unauthorized') }, { status: 401 })
    }
    if (!PSYCH_SIGNER_ROLES.some(r => session.roles.includes(r))) {
      return NextResponse.json({ error: serverT('forbidden') }, { status: 403 })
    }

    const sb = createServerClient()

    // 1. Активные этапы medical_psych процесса acceptance.
    const { data: stagesRaw, error: stErr } = await sb
      .from('stage_instances')
      .select(`
        id, status, activated_at, notes, process_instance_id,
        stage_template:stage_templates!inner(id, code, name_ru),
        process_instance:process_instances!inner(id, journey_id, status)
      `)
      .eq('stage_template.code', 'medical_psych')
      .eq('status', 'active')
      .order('activated_at', { ascending: true })
    if (stErr) throw stErr

    const stages = (stagesRaw ?? []) as unknown as Array<{
      id: string
      activated_at: string | null
      notes: string | null
      process_instance_id: string
      stage_template: { id: string; code: string; name_ru: string } | null
      process_instance: { id: string; journey_id: string; status: string } | null
    }>

    if (stages.length === 0) {
      const signature_method = await getSignatureMethod()
      return NextResponse.json({ referrals: [], finals: [], signature_method })
    }

    const journeyIds = [...new Set(stages.map(s => s.process_instance?.journey_id).filter(Boolean) as string[])]
    const processInstanceIds = [...new Set(stages.map(s => s.process_instance_id))]
    const psychTemplateId = stages[0].stage_template?.id ?? null

    // 2. Батч-выборки (без N+1).
    const [
      { data: journeys },
      { data: docs },
      { data: profiles },
      { data: sessions },
      { data: referStages },
      { data: finals },
      signature_method,
    ] = await Promise.all([
      sb.from('education_journeys')
        .select(`
          id, person_id, birth_date, gender, citizenship,
          person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name, email, phones, photo_url, birth_date, gender)
        `)
        .in('id', journeyIds),
      sb.from('document_records')
        .select('id, journey_id, doc_type, title, file_name, storage_path, file_url, created_at')
        .in('journey_id', journeyIds)
        .eq('status', 'active')
        .order('created_at', { ascending: true }),
      // psych_profiles — таблица может отсутствовать (42P01): ошибку игнорируем.
      sb.from('psych_profiles')
        .select('journey_id, presenting_concerns, background, risk_level, referral_source, notes')
        .in('journey_id', journeyIds),
      // psych_sessions — свежие сверху; ошибку (в т.ч. 42P01) игнорируем.
      sb.from('psych_sessions')
        .select('id, journey_id, session_date, session_type, summary, follow_up_date, status, counselor_id')
        .in('journey_id', journeyIds)
        .order('session_date', { ascending: false }),
      // Родственные этапы, завершённые направлением к психологу.
      sb.from('stage_instances')
        .select(`
          id, process_instance_id, final_code, notes, completed_at,
          stage_template:stage_templates(code, name_ru)
        `)
        .in('process_instance_id', processInstanceIds)
        .eq('final_code', 'refer_to_psychologist'),
      psychTemplateId
        ? sb.from('stage_finals')
            .select('id, code, name_ru, is_positive, sort_order')
            .eq('stage_template_id', psychTemplateId)
            .order('sort_order', { ascending: true })
        : Promise.resolve({ data: [] as { id: string; code: string; name_ru: string; is_positive: boolean; sort_order: number }[] }),
      getSignatureMethod(),
    ])

    // Подписи направивших этапов (кто направил).
    const referStageIds = (referStages ?? []).map(r => r.id)
    let signaturesByStage = new Map<string, string>()
    if (referStageIds.length > 0) {
      const { data: sigs } = await sb
        .from('stage_signatures')
        .select('stage_instance_id, signer_name')
        .in('stage_instance_id', referStageIds)
      for (const s of (sigs ?? []) as Array<{ stage_instance_id: string; signer_name: string | null }>) {
        if (s.signer_name) signaturesByStage.set(s.stage_instance_id, s.signer_name)
      }
    }

    // Индексация батчей по journey_id / process_instance_id.
    const journeyById = new Map<string, {
      person_id: string
      birth_date: string | null
      gender: string | null
      citizenship: string | null
      person: {
        id?: string; full_name?: string | null; hebrew_name?: string | null
        email?: string | null; phones?: unknown; photo_url?: string | null
        birth_date?: string | null; gender?: string | null
      } | null
    }>()
    for (const j of (journeys ?? []) as unknown as Array<{
      id: string; person_id: string; birth_date: string | null; gender: string | null; citizenship: string | null; person: unknown
    }>) {
      journeyById.set(j.id, { person_id: j.person_id, birth_date: j.birth_date, gender: j.gender, citizenship: j.citizenship, person: j.person as never })
    }

    const docsByJourney = new Map<string, Array<Record<string, unknown>>>()
    for (const d of (docs ?? []) as Array<{ journey_id: string } & Record<string, unknown>>) {
      const arr = docsByJourney.get(d.journey_id) ?? []
      arr.push(d)
      docsByJourney.set(d.journey_id, arr)
    }

    const profileByJourney = new Map<string, Record<string, unknown>>()
    for (const p of (profiles ?? []) as Array<{ journey_id: string } & Record<string, unknown>>) {
      profileByJourney.set(p.journey_id, p)
    }

    const sessionsByJourney = new Map<string, Array<Record<string, unknown>>>()
    for (const v of (sessions ?? []) as Array<{ journey_id: string } & Record<string, unknown>>) {
      const arr = sessionsByJourney.get(v.journey_id) ?? []
      arr.push(v)
      sessionsByJourney.set(v.journey_id, arr)
    }

    const refersByProcess = new Map<string, Array<{ from_stage: string; note: string | null; signer_name: string | null; completed_at: string | null }>>()
    for (const r of (referStages ?? []) as unknown as Array<{
      id: string; process_instance_id: string; notes: string | null; completed_at: string | null
      stage_template: { code: string; name_ru: string } | null
    }>) {
      const arr = refersByProcess.get(r.process_instance_id) ?? []
      arr.push({
        from_stage: r.stage_template?.name_ru ?? r.stage_template?.code ?? '—',
        note: r.notes ?? null,
        signer_name: signaturesByStage.get(r.id) ?? null,
        completed_at: r.completed_at,
      })
      refersByProcess.set(r.process_instance_id, arr)
    }

    // 3. Сборка ответа.
    const referrals = stages.map(s => {
      const journeyId = s.process_instance?.journey_id ?? null
      const j = journeyId ? journeyById.get(journeyId) : null
      const person = j?.person ?? null
      return {
        stage_instance_id: s.id,
        activated_at: s.activated_at,
        journey_id: journeyId,
        applicant: {
          person_id: person?.id ?? j?.person_id ?? null,
          full_name: person?.full_name ?? '',
          hebrew_name: person?.hebrew_name ?? null,
          email: person?.email ?? null,
          phones: flattenPhones(person?.phones),
          photo_url: person?.photo_url ?? null,
          birth_date: person?.birth_date ?? j?.birth_date ?? null,
          gender: person?.gender ?? j?.gender ?? null,
          citizenship: j?.citizenship ?? null,
        },
        referrals: journeyId ? (refersByProcess.get(s.process_instance_id) ?? []) : [],
        documents: journeyId ? (docsByJourney.get(journeyId) ?? []) : [],
        psych_profile: journeyId ? (profileByJourney.get(journeyId) ?? null) : null,
        psych_sessions: journeyId ? (sessionsByJourney.get(journeyId) ?? []) : [],
      }
    })

    return NextResponse.json({ referrals, finals: finals ?? [], signature_method })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
