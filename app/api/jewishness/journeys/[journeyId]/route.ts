import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT } from '@/lib/i18n/api-errors'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireJewishnessAccess } from '@/lib/jewishness/permissions'
import { getSignatureMethod } from '@/lib/settings/app-settings'

/**
 * GET /api/jewishness/journeys/[journeyId] — карточка проверки еврейства:
 * текущий статус + заметка + кто/когда решил, история изменений, документы, и —
 * если студентка на активном acceptance-этапе 'jewishness' — его id + финалы
 * (для подписанного решения через общий /workflow/stages/.../complete).
 *
 * Право: jewishness.access. Деплой-безопасно: нет колонок/таблицы истории →
 * статус 'pending' / пустая история.
 */
export async function GET(_request: NextRequest, { params }: { params: { journeyId: string } }) {
  try {
    await requireJewishnessAccess()
    const sb = createServerClient()
    const u = sb as unknown as SupabaseClient

    const { data: journey, error: jErr } = await sb
      .from('education_journeys')
      .select('*, person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name, email, phones, photo_url)')
      .eq('id', params.journeyId)
      .maybeSingle()
    if (jErr) throw jErr
    if (!journey) return apiError('journey_not_found', 404)

    const j = journey as unknown as Record<string, unknown> & {
      person: { id?: string; full_name?: string | null; hebrew_name?: string | null; email?: string | null; phones?: unknown; photo_url?: string | null } | null
    }

    // Имя того, кто решил.
    let verifiedByName: string | null = null
    const verifiedBy = (j.jewishness_verified_by as string | null) ?? null
    if (verifiedBy) {
      const { data: p } = await sb.from('persons').select('full_name, hebrew_name').eq('id', verifiedBy).maybeSingle()
      const pp = p as { full_name: string | null; hebrew_name: string | null } | null
      verifiedByName = (pp?.full_name || pp?.hebrew_name || '').trim() || null
    }

    // История (append-only). Деплой-безопасно к отсутствию таблицы.
    let history: Array<{ status: string; note: string | null; source: string | null; created_at: string; changed_by_name: string | null }> = []
    try {
      const { data: rows, error } = await u
        .from('jewishness_status_history')
        .select('status, note, source, changed_by, created_at')
        .eq('journey_id', params.journeyId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      const list = (rows ?? []) as Array<{ status: string; note: string | null; source: string | null; changed_by: string | null; created_at: string }>
      const ids = [...new Set(list.map(r => r.changed_by).filter(Boolean) as string[])]
      const nameById = new Map<string, string>()
      if (ids.length) {
        const { data: persons } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', ids)
        for (const p of (persons ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) {
          nameById.set(p.id, (p.full_name || p.hebrew_name || '').trim())
        }
      }
      history = list.map(r => ({
        status: r.status, note: r.note, source: r.source, created_at: r.created_at,
        changed_by_name: r.changed_by ? nameById.get(r.changed_by) ?? null : null,
      }))
    } catch (e) {
      if ((e as { code?: string }).code !== '42P01') throw e
    }

    // Документы студентки (общая таблица document_records).
    const { data: docs } = await sb
      .from('document_records')
      .select('id, doc_type, title, file_name, created_at')
      .eq('journey_id', params.journeyId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })

    // Активный acceptance-этап 'jewishness' (для подписанного решения) + финалы.
    let stageInstanceId: string | null = null
    let templateId: string | null = null
    const { data: st } = await sb
      .from('stage_instances')
      .select('id, status, stage_template:stage_templates!inner(id, code), process_instance:process_instances!inner(journey_id)')
      .eq('stage_template.code', 'jewishness')
      .eq('process_instance.journey_id', params.journeyId)
      .eq('status', 'active')
      .limit(1)
    const stArr = (st ?? []) as unknown as Array<{ id: string; stage_template: { id: string } | null }>
    if (stArr.length > 0) {
      stageInstanceId = stArr[0].id
      templateId = stArr[0].stage_template?.id ?? null
    }
    let finals: Array<{ id: string; code: string; name_ru: string; is_positive: boolean }> = []
    if (templateId) {
      const { data: f } = await sb.from('stage_finals')
        .select('id, code, name_ru, is_positive, sort_order')
        .eq('stage_template_id', templateId).order('sort_order', { ascending: true })
      finals = (f ?? []) as typeof finals
    }

    const signature_method = await getSignatureMethod()

    return NextResponse.json({
      journey_id: params.journeyId,
      applicant: {
        person_id: j.person?.id ?? null,
        full_name: j.person?.full_name ?? '',
        hebrew_name: j.person?.hebrew_name ?? null,
        email: j.person?.email ?? null,
        birth_date: (j.birth_date as string | null) ?? null,
        citizenship: (j.citizenship as string | null) ?? null,
      },
      status: (j.jewishness_status as string | null) ?? 'pending',
      notes: (j.jewishness_notes as string | null) ?? null,
      verified_by_name: verifiedByName,
      verified_at: (j.jewishness_verified_at as string | null) ?? null,
      history,
      documents: docs ?? [],
      active_stage_instance_id: stageInstanceId,
      finals,
      signature_method,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
