import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege, canDoEducationInAny, getEducationPrivilegeScope } from '@/lib/education/permissions'
import { startProcess, type StartProcessResult } from '@/lib/workflow/start-process'
import type {
  EducationJourneyInsert,
  CommunityInsert,
  JourneyCommunityInsert,
} from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

/**
 * GET /api/education/leads
 * Возвращает journeys со статусом 'lead' в формате, совместимом со старым UI лидов.
 * Формат ответа: [{ profile_id, person_id, full_name, email, phones, photo_url,
 *                   referral_source, application_date, interests: [{free_text}] }]
 *
 * Поле profile_id здесь == journey.id (UI ожидает это для последующего convert).
 * interests берутся из lead_interests.free_text (каскад direction_id/level_id —
 * следующие этапы).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth()
    const ok = await canDoEducationInAny(session, 'view_leads')
    if (!ok) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
    const sb = createServerClient()

    const processStatus = request.nextUrl.searchParams.get('process_status') ?? 'active'

    // Просмотр удалённых — только manage_leads + scope=all
    if (processStatus === 'deleted') {
      const scope = await getEducationPrivilegeScope(session, 'manage_leads')
      if (scope !== 'all') return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
    }

    let journeysQuery = sb
      .from('education_journeys')
      .select('id, person_id, referral_source, application_date, opened_at, notes, updated_at, is_deleted')
      .eq('education_status', 'lead')
      .order('updated_at', { ascending: false })

    if (processStatus === 'deleted') {
      journeysQuery = journeysQuery.eq('is_deleted', true)
    } else {
      journeysQuery = journeysQuery.eq('is_deleted', false)
    }

    const { data: journeys, error: jErr } = await journeysQuery

    if (jErr) throw jErr
    if (!journeys || journeys.length === 0) return NextResponse.json([])

    const personIds = journeys.map(j => j.person_id)
    const journeyIds = journeys.map(j => j.id)

    // Все process_instances для фильтрации по статусу
    const { data: allPi } = await sb
      .from('process_instances')
      .select('id, journey_id, status')
      .in('journey_id', journeyIds)

    const journeyHasActive = new Set<string>()
    const journeyHasTerminated = new Set<string>()
    for (const pi of allPi ?? []) {
      if ((pi.status as string) === 'active') journeyHasActive.add(pi.journey_id as string)
      else if ((pi.status as string) === 'cancelled' || (pi.status as string) === 'completed') {
        journeyHasTerminated.add(pi.journey_id as string)
      }
    }

    const filteredJourneys = journeys.filter(j => {
      if (processStatus === 'deleted') return true // already filtered in DB query
      if (processStatus === 'active') {
        // Показать: есть активный процесс ИЛИ вообще нет процесса
        return journeyHasActive.has(j.id) || !journeyHasTerminated.has(j.id)
      }
      if (processStatus === 'closed') {
        // Показать: есть завершённый/отменённый процесс И нет активного
        return journeyHasTerminated.has(j.id) && !journeyHasActive.has(j.id)
      }
      return true // all
    })

    if (filteredJourneys.length === 0) return NextResponse.json([])

    const filteredPersonIds = filteredJourneys.map(j => j.person_id)
    const filteredJourneyIds = filteredJourneys.map(j => j.id)

    const [{ data: persons }, { data: interests }] = await Promise.all([
      sb.from('persons')
        .select('id, full_name, email, phones, photo_url')
        .in('id', filteredPersonIds),
      sb.from('lead_interests')
        .select('person_id, free_text, direction:reference_directions(name_ru, department:departments(name)), level:reference_levels(name_ru)')
        .in('person_id', filteredPersonIds),
    ])

    const personMap = new Map((persons ?? []).map(p => [p.id, p]))
    type InterestOut = { free_text: string | null; direction_name: string | null; level_name: string | null; department_name: string | null }
    const interestMap = new Map<string, InterestOut[]>()
    for (const i of interests ?? []) {
      const dir = (i.direction as unknown) as { name_ru: string; department: { name: string } | null } | null
      const lvl = (i.level as unknown) as { name_ru: string } | null
      if (!interestMap.has(i.person_id)) interestMap.set(i.person_id, [])
      interestMap.get(i.person_id)!.push({
        free_text: i.free_text,
        direction_name: dir?.name_ru ?? null,
        level_name: lvl?.name_ru ?? null,
        department_name: dir?.department?.name ?? null,
      })
    }

    // Fetch active stages with their tasks, grouped per journey
    type StageEntry = { stageName: string; tasks: string[] }
    const journeyStages = new Map<string, StageEntry[]>()
    for (const j of filteredJourneys) journeyStages.set(j.id, [])

    // Только активные process_instances (для stages/tasks)
    const activePiToJourney = new Map<string, string>()
    for (const pi of allPi ?? []) {
      if ((pi.status as string) === 'active' && filteredJourneyIds.includes(pi.journey_id as string)) {
        activePiToJourney.set(pi.id as string, pi.journey_id as string)
      }
    }

    const piToJourney = activePiToJourney
    const piIds = [...piToJourney.keys()]

    if (piIds.length > 0) {
      const { data: stageInstances } = await sb
        .from('stage_instances')
        .select('id, process_instance_id, stage_template:stage_templates(name_ru)')
        .in('process_instance_id', piIds)
        .eq('status', 'active')

      const siToEntry = new Map<string, StageEntry>()
      for (const si of stageInstances ?? []) {
        const journeyId = piToJourney.get(si.process_instance_id as string)
        if (!journeyId) continue
        const name = (si.stage_template as unknown as { name_ru: string } | null)?.name_ru
        if (!name) continue
        const entry: StageEntry = { stageName: name, tasks: [] }
        siToEntry.set(si.id as string, entry)
        journeyStages.get(journeyId)!.push(entry)
      }

      const siIds = [...siToEntry.keys()]
      if (siIds.length > 0) {
        const { data: tasks } = await sb
          .from('tasks')
          .select('title, stage_instance_id')
          .in('stage_instance_id', siIds)
          .in('status', ['unassigned', 'pending', 'in_progress'])

        for (const t of tasks ?? []) {
          siToEntry.get(t.stage_instance_id as string)?.tasks.push(t.title as string)
        }
      }
    }

    const result = filteredJourneys.map(j => {
      const person = personMap.get(j.person_id)
      return {
        profile_id: j.id,
        person_id: j.person_id,
        full_name: person?.full_name ?? '',
        email: person?.email ?? null,
        phones: (person?.phones as string[]) ?? [],
        photo_url: person?.photo_url ?? null,
        referral_source: j.referral_source ?? null,
        application_date: j.application_date ?? j.opened_at ?? null,
        updated_at: j.updated_at ?? null,
        is_deleted: (j as unknown as { is_deleted: boolean }).is_deleted ?? false,
        interests: interestMap.get(j.person_id) ?? [],
        active_stages_with_tasks: (journeyStages.get(j.id) ?? []).map(s => ({
          stage_name: s.stageName,
          tasks: s.tasks,
        })),
      }
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

interface CommunityPayload {
  country?: string
  city?: string
  name?: string
  contact_person?: string
  contact_person_id?: string | null
  position?: string
  phone?: string
  email?: string
  contacts?: { type: string; value: string }[]
}

/**
 * POST /api/education/leads
 * Создаёт лида:
 *   1. person (новый или существующий)
 *   2. education_journeys с education_status='lead'
 *   3. lead_interests (legacy, для совместимости — удалим в Part 2)
 *   4. communities + journey_communities (для каждой переданной общины)
 *
 * Право: manage_students (без department — у лида ещё нет привязки).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    await requireEducationPrivilege('manage_leads', {})
    const sb = createServerClient()
    const body = await request.json() as {
      person_id?: string
      last_name?: string | null
      first_name?: string
      middle_name?: string | null
      full_name?: string   // legacy fallback → first_name
      phone?: string
      phones?: string[]
      email?: string
      gender?: string
      birth_date?: string
      hebrew_name?: string
      marital_status?: string
      citizenship?: string
      passport_number?: string
      address?: Record<string, unknown>
      interests?: { direction_id?: string | null; level_id?: string | null; free_text?: string | null }[]
      communities?: CommunityPayload[]
      referral_source?: string
      comment?: string
    }

    let personId: string

    if (body.person_id) {
      const { data: person } = await sb
        .from('persons')
        .select('id')
        .eq('id', body.person_id)
        .maybeSingle()
      if (!person) return NextResponse.json({ error: 'Человек не найден' }, { status: 404 })
      personId = person.id
    } else {
      const leadFirstName = body.first_name?.trim() || body.full_name?.trim() || ''
      if (!leadFirstName) return NextResponse.json({ error: 'ФИО обязательно' }, { status: 400 })
      const leadLastName   = body.first_name?.trim() ? (body.last_name?.trim() || null) : null
      const leadMiddleName = body.first_name?.trim() ? (body.middle_name?.trim() || null) : null
      if (!body.phone?.trim()) return NextResponse.json({ error: 'Телефон обязателен' }, { status: 400 })

      const phones = body.phones && body.phones.length > 0
        ? body.phones.map(p => p.trim()).filter(Boolean)
        : [body.phone.trim()]

      const { data: newPerson, error: personErr } = await sb
        .from('persons')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          last_name: leadLastName,
          first_name: leadFirstName,
          middle_name: leadMiddleName,
          hebrew_name: body.hebrew_name?.trim() || null,
          phones,
          email: body.email?.trim() || null,
          gender: (body.gender as 'male' | 'female' | 'other') || null,
          birth_date: body.birth_date || null,
          photo_url: null,
          address: (body.address && Object.values(body.address).some(v => v)) ? body.address : null,
          notes: null,
          marital_status: body.marital_status || null,
          nationality: body.citizenship || null,
          passport_number: body.passport_number?.trim() || null,
        } as any)
        .select('id')
        .single()

      if (personErr || !newPerson) throw personErr ?? new Error('Ошибка создания person')
      personId = newPerson.id
    }

    // Проверка: нет ли уже открытого journey у этого person со статусом != lead
    const { data: existingJourney } = await sb
      .from('education_journeys')
      .select('id, education_status, closed_at')
      .eq('person_id', personId)
      .is('closed_at', null)
      .maybeSingle()

    let journeyId: string
    if (existingJourney) {
      if (existingJourney.education_status !== 'lead') {
        return NextResponse.json(
          { error: 'У этого человека уже есть активный journey с другим статусом' },
          { status: 409 }
        )
      }
      journeyId = existingJourney.id
    } else {
      const today = new Date().toISOString().slice(0, 10)
      const journeyInsert: EducationJourneyInsert = {
        person_id: personId,
        education_status: 'lead',
        opened_at: today,
        application_date: today,
        referral_source: body.referral_source || null,
        notes: body.comment || null,
        status: 'new',
      }
      const { data: newJourney, error: jErr } = await sb
        .from('education_journeys')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(journeyInsert as any)
        .select('id')
        .single()
      if (jErr || !newJourney) throw jErr ?? new Error('Ошибка создания journey')
      journeyId = newJourney.id
    }

    // lead_interests: каскад direction_id/level_id или свободный текст free_text.
    const validInterests = (body.interests ?? []).filter(i => i.direction_id || i.free_text?.trim())
    if (validInterests.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await sb.from('lead_interests').insert(
        validInterests.map(i => i.direction_id
          ? { person_id: personId, direction_id: i.direction_id, level_id: i.level_id ?? null, free_text: null }
          : { person_id: personId, direction_id: null, level_id: null, free_text: i.free_text?.trim() || null }
        ) as any
      )
    }

    // Communities: для каждой переданной — найти/создать в communities + журнал в journey_communities
    const validCommunities = (body.communities ?? []).filter(c =>
      (c.name?.trim() || c.contact_person?.trim() || c.phone?.trim()) &&
      c.country?.trim() && c.city?.trim()
    )
    for (const c of validCommunities) {
      const name = c.name?.trim() || `Без названия — ${c.city?.trim()}`
      const country = c.country!.trim()
      const city = c.city!.trim()

      const { data: existingComm } = await sb
        .from('communities')
        .select('id')
        .eq('name', name)
        .eq('city', city)
        .eq('country', country)
        .maybeSingle()

      let communityId: string
      if (existingComm) {
        communityId = existingComm.id
      } else {
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
            if (!raceComm) continue
            communityId = raceComm.id
          } else {
            continue
          }
        } else if (!newComm) {
          continue
        } else {
          communityId = newComm.id
        }
      }

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
      // PRIMARY KEY (journey_id, community_id) — игнорим дубль (23505)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await sb.from('journey_communities').insert(jcInsert as any)
    }

    // person_status_history
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sb.from('person_status_history').insert({
      person_id: personId,
      from_status: null,
      to_status: 'lead',
      changed_by: session.person_id,
    } as any)

    // Автостарт процесса «Набор» — некритичный, ошибка не блокирует создание лида
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
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
