import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { startProcess, type StartProcessResult } from '@/lib/workflow/start-process'
import { parseBody, jsonError } from '@/lib/api/handler'
import type { CommunityInsert, JourneyCommunityInsert } from '@/types/database'

const interestSchema = z.object({
  direction_id: z.string().uuid().nullish(),
  level_id: z.string().uuid().nullish(),
  free_text: z.string().trim().min(1).nullish(),
})

const communitySchema = z.object({
  country: z.string().trim().min(1),
  city: z.string().trim().min(1),
  name: z.string().trim().optional(),
  contact_person: z.string().trim().optional(),
  position: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  contacts: z.array(z.object({ type: z.string(), value: z.string() })).optional(),
})

const applicationSchema = z.object({
  person_id: z.string().uuid().optional(),
  last_name: z.string().trim().optional(),
  first_name: z.string().trim().optional(),
  middle_name: z.string().trim().optional(),
  full_name: z.string().trim().optional(), // legacy fallback → first_name
  phone: z.string().trim().optional(),
  phones: z.array(z.string().trim()).optional(),
  email: z.string().trim().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  birth_date: z.string().optional(),
  hebrew_name: z.string().trim().optional(),
  marital_status: z.string().optional(),
  citizenship: z.string().optional(),
  passport_number: z.string().optional(),
  address: z.record(z.string(), z.unknown()).optional(),
  interests: z.array(interestSchema).optional(),
  communities: z.array(communitySchema).optional(),
  referral_source: z.string().optional(),
  comment: z.string().optional(),
}).refine(d => d.person_id || d.first_name?.trim() || d.full_name?.trim(), {
  message: 'Укажите person_id или ФИО',
})

/**
 * POST /api/applications
 *
 * Создаёт заявку (лид) целиком:
 *   1. person (новый или существующий) + education_journey('lead') +
 *      lead_interests + person_status_history — атомарно, одной транзакцией
 *      через RPC create_application (см. migrations/20260702130000_*.sql).
 *   2. communities/journey_communities — best-effort после транзакции
 *      (как и раньше: параллельная гонка на create допустима, не блокирует заявку).
 *   3. Автостарт процесса «Набор» (startProcess) — best-effort, ошибка не блокирует
 *      создание заявки (тот же принцип, что уже был в /api/education/leads).
 *
 * Право: manage_leads (без department — у заявки ещё нет привязки к подразделению).
 *
 * Отличие от /api/education/leads (POST): та же бизнес-операция, но
 * person+journey+interests+history создаются в одной DB-транзакции вместо
 * последовательности insert-ов без отката.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireEducationPrivilege('manage_leads', {})
    const body = await parseBody(request, applicationSchema)

    if (!body.person_id) {
      const hasPhone = !!body.phone?.trim() || !!(body.phones && body.phones.length > 0)
      if (!hasPhone) {
        throw Object.assign(new Error('Телефон обязателен'), { status: 400 })
      }
    }

    const sb = createServerClient()

    const { data: rpcResult, error: rpcErr } = await sb.rpc('create_application', {
      payload: {
        person_id: body.person_id ?? null,
        last_name: body.last_name?.trim() || null,
        first_name: body.first_name?.trim() || body.full_name?.trim() || null,
        middle_name: body.middle_name?.trim() || null,
        hebrew_name: body.hebrew_name?.trim() || null,
        phone: body.phone?.trim() || null,
        phones: body.phones && body.phones.length > 0
          ? body.phones.map(p => p.trim()).filter(Boolean)
          : null,
        email: body.email?.trim() || null,
        gender: body.gender ?? null,
        birth_date: body.birth_date || null,
        address: (body.address && Object.values(body.address).some(v => v)) ? body.address : null,
        marital_status: body.marital_status || null,
        citizenship: body.citizenship || null,
        passport_number: body.passport_number?.trim() || null,
        interests: body.interests ?? [],
        referral_source: body.referral_source || null,
        comment: body.comment || null,
        actor_id: session.person_id,
      },
    })

    if (rpcErr) throw rpcErr
    const { person_id: personId, journey_id: journeyId } = rpcResult as { person_id: string; journey_id: string }

    // Communities: для каждой переданной — найти/создать в communities + журнал
    // в journey_communities. Best-effort, вне транзакции — ошибка на одной общине
    // не должна откатывать уже созданную заявку.
    const validCommunities = (body.communities ?? []).filter(c =>
      (c.name?.trim() || c.contact_person?.trim() || c.phone?.trim()) &&
      c.country?.trim() && c.city?.trim()
    )
    for (const c of validCommunities) {
      const name = c.name?.trim() || `Без названия — ${c.city?.trim()}`
      const country = c.country.trim()
      const city = c.city.trim()

      const { data: existingComm } = await sb
        .from('communities')
        .select('id')
        .eq('name', name)
        .eq('city', city)
        .eq('country', country)
        .maybeSingle()

      let communityId: string | null = existingComm?.id ?? null
      if (!communityId) {
        const commInsert: CommunityInsert = {
          name,
          name_he: null,
          country,
          city,
          default_contact_name: c.contact_person?.trim() || null,
          default_contact_role: c.position?.trim() || null,
          default_contact_phone: c.phone?.trim() || null,
          default_contact_email: c.email?.trim() || null,
          notes: null,
        }
        const { data: newComm, error: commErr } = await sb
          .from('communities')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(commInsert as any)
          .select('id')
          .single()

        if (commErr) {
          // 23505 — гонка: кто-то создал параллельно. Попробуем найти ещё раз.
          if (commErr.code === '23505') {
            const { data: raceComm } = await sb
              .from('communities')
              .select('id')
              .eq('name', name)
              .eq('city', city)
              .eq('country', country)
              .maybeSingle()
            communityId = raceComm?.id ?? null
          }
        } else {
          communityId = newComm?.id ?? null
        }
      }
      if (!communityId) continue

      const extraNotes = c.contacts && c.contacts.length > 0
        ? c.contacts
            .filter(x => x.value?.trim())
            .map(x => `${x.type}: ${x.value}`)
            .join('; ')
        : null

      const jcInsert: JourneyCommunityInsert = {
        journey_id: journeyId,
        community_id: communityId,
        contact_name: c.contact_person?.trim() || null,
        contact_role: c.position?.trim() || null,
        contact_phone: c.phone?.trim() || null,
        contact_email: c.email?.trim() || null,
        notes: extraNotes,
      }
      // PRIMARY KEY (journey_id, community_id) — игнорируем дубль (23505)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await sb.from('journey_communities').insert(jcInsert as any)
    }

    // Автостарт процесса «Набор» — некритичный, ошибка не блокирует создание заявки.
    let workflowResult: StartProcessResult | null = null
    let workflowError: string | null = null
    try {
      workflowResult = await startProcess(sb, 'recruitment', journeyId, session.person_id)
    } catch (wfErr: unknown) {
      workflowError = (wfErr as { message?: string }).message ?? 'Ошибка запуска процесса'
    }

    return NextResponse.json(
      { person_id: personId, journey_id: journeyId, workflow: workflowResult, workflow_error: workflowError },
      { status: 201 }
    )
  } catch (err: unknown) {
    return jsonError(err)
  }
}
