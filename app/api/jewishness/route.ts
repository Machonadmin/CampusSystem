import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireJewishnessAccess } from '@/lib/jewishness/permissions'
import { getSignatureMethod } from '@/lib/settings/app-settings'

/**
 * GET /api/jewishness — ПОЛНЫЙ модуль בירור יהדות (не только очередь).
 * Все абитуриентки/студентки с их статусом верификации, числом документов и
 * признаком активного acceptance-этапа 'jewishness'. Фильтры: ?status, ?search.
 *
 * Право: jewishness.access. Деплой-безопасно: если колонки jewishness_status
 * ещё нет (миграция не применена) — все считаются 'pending'.
 */

function flattenPhones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map(p => (typeof p === 'string' ? p : (p as { number?: string })?.number ?? '')).filter(Boolean)
}

const STATUSES = ['pending', 'verified', 'rejected', 'needs_review'] as const

export async function GET(request: NextRequest) {
  try {
    await requireJewishnessAccess()
    const sb = createServerClient()
    const statusFilter = request.nextUrl.searchParams.get('status')?.trim() || null
    const search = request.nextUrl.searchParams.get('search')?.trim().toLowerCase() || null

    const signature_method = await getSignatureMethod()

    // Все journey в фазе приёма/учёбы. '*' — чтобы подхватить jewishness_status
    // после миграции и не падать до неё (без явного select колонки).
    const { data: rows, error } = await sb
      .from('education_journeys')
      .select('*, person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name, email, phones, photo_url)')
      .in('education_status', ['applicant', 'student'])
    if (error) throw error

    type Row = Record<string, unknown> & {
      id: string
      person: { id?: string; full_name?: string | null; hebrew_name?: string | null; email?: string | null; phones?: unknown; photo_url?: string | null } | null
    }
    const journeys = (rows ?? []) as unknown as Row[]
    const journeyIds = journeys.map(j => j.id)

    // Число активных документов на journey.
    const docCount = new Map<string, number>()
    if (journeyIds.length) {
      const { data: docs } = await sb
        .from('document_records').select('journey_id').in('journey_id', journeyIds).eq('status', 'active')
      for (const d of (docs ?? []) as Array<{ journey_id: string }>) {
        docCount.set(d.journey_id, (docCount.get(d.journey_id) ?? 0) + 1)
      }
    }

    // Активные acceptance-этапы 'jewishness'.
    const activeStage = new Set<string>()
    const { data: st } = await sb
      .from('stage_instances')
      .select('status, stage_template:stage_templates!inner(code), process_instance:process_instances!inner(journey_id)')
      .eq('stage_template.code', 'jewishness')
      .eq('status', 'active')
    for (const s of (st ?? []) as unknown as Array<{ process_instance: { journey_id: string } | null }>) {
      const jid = s.process_instance?.journey_id
      if (jid) activeStage.add(jid)
    }

    const counts: Record<string, number> = { pending: 0, verified: 0, rejected: 0, needs_review: 0 }
    let students = journeys.map(j => {
      const status = (STATUSES as readonly string[]).includes(j.jewishness_status as string)
        ? (j.jewishness_status as string) : 'pending'
      counts[status] = (counts[status] ?? 0) + 1
      const person = j.person
      return {
        journey_id: j.id,
        full_name: person?.full_name ?? '',
        hebrew_name: person?.hebrew_name ?? null,
        email: person?.email ?? null,
        phones: flattenPhones(person?.phones),
        photo_url: person?.photo_url ?? null,
        status,
        doc_count: docCount.get(j.id) ?? 0,
        has_active_stage: activeStage.has(j.id),
      }
    })

    if (statusFilter && (STATUSES as readonly string[]).includes(statusFilter)) {
      students = students.filter(s => s.status === statusFilter)
    }
    if (search) {
      students = students.filter(s =>
        s.full_name.toLowerCase().includes(search)
        || (s.hebrew_name ?? '').toLowerCase().includes(search)
        || (s.email ?? '').toLowerCase().includes(search))
    }
    students.sort((a, b) => (a.full_name || a.hebrew_name || '').localeCompare(b.full_name || b.hebrew_name || '', 'he'))

    return NextResponse.json({ students, counts, signature_method })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
