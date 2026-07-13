import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireJewishnessAccess } from '@/lib/jewishness/permissions'
import { getSignatureMethod } from '@/lib/settings/app-settings'

/**
 * GET /api/jewishness — очередь бирур-яхадут: абитуриентки, у которых АКТИВЕН
 * этап `jewishness` процесса приёма. По каждой — данные + загруженные документы
 * + финалы этапа + метод подписи (чтобы подписать заключение прямо из очереди
 * через общий /api/workflow/stages/.../complete). Право: jewishness.access
 * (superadmin — в обход). Загрузка/просмотр документов — эндпоинты queue/…
 */

function flattenPhones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(p => (typeof p === 'string' ? p : (p as { number?: string })?.number ?? ''))
    .filter(Boolean)
}

export async function GET() {
  try {
    await requireJewishnessAccess()
    const sb = createServerClient()

    // Активные этапы jewishness процесса acceptance.
    const { data: stagesRaw, error: stErr } = await sb
      .from('stage_instances')
      .select(`
        id, status, activated_at,
        stage_template:stage_templates!inner(id, code),
        process_instance:process_instances!inner(id, journey_id, status)
      `)
      .eq('stage_template.code', 'jewishness')
      .eq('status', 'active')
      .order('activated_at', { ascending: true })
    if (stErr) throw stErr

    const stages = (stagesRaw ?? []) as unknown as Array<{
      id: string
      activated_at: string | null
      stage_template: { id: string; code: string } | null
      process_instance: { id: string; journey_id: string } | null
    }>

    const signature_method = await getSignatureMethod()

    if (stages.length === 0) {
      return NextResponse.json({ items: [], finals: [], signature_method })
    }

    const journeyIds = [...new Set(stages.map(s => s.process_instance?.journey_id).filter(Boolean) as string[])]
    const templateId = stages[0].stage_template?.id ?? null

    const [{ data: journeys }, { data: docs }, { data: finals }] = await Promise.all([
      sb.from('education_journeys')
        .select('id, birth_date, citizenship, person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name, email, phones, photo_url)')
        .in('id', journeyIds),
      sb.from('document_records')
        .select('id, journey_id, doc_type, title, file_name, storage_path, file_url, created_at')
        .in('journey_id', journeyIds)
        .eq('status', 'active')
        .order('created_at', { ascending: true }),
      templateId
        ? sb.from('stage_finals')
            .select('id, code, name_ru, is_positive, sort_order')
            .eq('stage_template_id', templateId)
            .order('sort_order', { ascending: true })
        : Promise.resolve({ data: [] as { id: string; code: string; name_ru: string; is_positive: boolean; sort_order: number }[] }),
    ])

    const journeyById = new Map<string, {
      birth_date: string | null; citizenship: string | null
      person: { id?: string; full_name?: string | null; hebrew_name?: string | null; email?: string | null; phones?: unknown; photo_url?: string | null } | null
    }>()
    for (const j of (journeys ?? []) as unknown as Array<{ id: string; birth_date: string | null; citizenship: string | null; person: unknown }>) {
      journeyById.set(j.id, { birth_date: j.birth_date, citizenship: j.citizenship, person: j.person as never })
    }

    const docsByJourney = new Map<string, Array<Record<string, unknown>>>()
    for (const d of (docs ?? []) as Array<{ journey_id: string } & Record<string, unknown>>) {
      const arr = docsByJourney.get(d.journey_id) ?? []
      arr.push(d)
      docsByJourney.set(d.journey_id, arr)
    }

    const items = stages.map(s => {
      const journeyId = s.process_instance?.journey_id ?? null
      const j = journeyId ? journeyById.get(journeyId) : null
      const person = j?.person ?? null
      return {
        stage_instance_id: s.id,
        activated_at: s.activated_at,
        journey_id: journeyId,
        applicant: {
          person_id: person?.id ?? null,
          full_name: person?.full_name ?? '',
          hebrew_name: person?.hebrew_name ?? null,
          email: person?.email ?? null,
          phones: flattenPhones(person?.phones),
          photo_url: person?.photo_url ?? null,
          birth_date: j?.birth_date ?? null,
          citizenship: j?.citizenship ?? null,
        },
        documents: journeyId ? (docsByJourney.get(journeyId) ?? []) : [],
      }
    })

    return NextResponse.json({ items, finals: finals ?? [], signature_method })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
