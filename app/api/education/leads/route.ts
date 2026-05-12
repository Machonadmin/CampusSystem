import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege } from '@/lib/education/permissions'
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
 *                   referral_source, application_date, interests: [{institution, direction}] }]
 *
 * Поле profile_id здесь == journey.id (UI ожидает это для последующего convert).
 * interests пока берутся из legacy-таблицы lead_interests (удалим в Part 2).
 */
export async function GET() {
  try {
    await requireAuth()
    const sb = createServerClient()

    const { data: journeys, error: jErr } = await sb
      .from('education_journeys')
      .select('id, person_id, referral_source, application_date, opened_at, notes')
      .eq('education_status', 'lead')
      .order('opened_at', { ascending: false })

    if (jErr) throw jErr
    if (!journeys || journeys.length === 0) return NextResponse.json([])

    const personIds = journeys.map(j => j.person_id)

    const [{ data: persons }, { data: interests }] = await Promise.all([
      sb.from('persons')
        .select('id, full_name, email, phones, photo_url')
        .in('id', personIds),
      sb.from('lead_interests')
        .select('person_id, institution, direction')
        .in('person_id', personIds),
    ])

    const personMap = new Map((persons ?? []).map(p => [p.id, p]))
    const interestMap = new Map<string, { institution: string; direction: string | null }[]>()
    for (const i of interests ?? []) {
      if (!interestMap.has(i.person_id)) interestMap.set(i.person_id, [])
      interestMap.get(i.person_id)!.push({ institution: i.institution, direction: i.direction })
    }

    const result = journeys.map(j => {
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
        interests: interestMap.get(j.person_id) ?? [],
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
    await requireEducationPrivilege('manage_students', {})
    const sb = createServerClient()
    const body = await request.json() as {
      person_id?: string
      full_name?: string
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
      interests?: { institution: string; direction?: string }[]
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await sb.from('persons').update({ education_status: 'lead' } as any).eq('id', personId)
    } else {
      if (!body.full_name?.trim()) return NextResponse.json({ error: 'ФИО обязательно' }, { status: 400 })
      if (!body.phone?.trim()) return NextResponse.json({ error: 'Телефон обязателен' }, { status: 400 })

      const phones = body.phones && body.phones.length > 0
        ? body.phones.map(p => p.trim()).filter(Boolean)
        : [body.phone.trim()]

      const { data: newPerson, error: personErr } = await sb
        .from('persons')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          full_name: body.full_name.trim(),
          hebrew_name: body.hebrew_name?.trim() || null,
          phones,
          email: body.email?.trim() || null,
          gender: (body.gender as 'male' | 'female' | 'other') || null,
          birth_date: body.birth_date || null,
          photo_url: null,
          address: (body.address && Object.values(body.address).some(v => v)) ? body.address : null,
          notes: null,
          education_status: 'lead',
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

    // Legacy: lead_interests (сохраняем для обратной совместимости — удалим в Part 2)
    const validInterests = (body.interests ?? []).filter(i => i.institution)
    if (validInterests.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await sb.from('lead_interests').insert(
        validInterests.map(i => ({
          person_id: personId,
          institution: i.institution,
          direction: i.direction?.trim() || null,
        })) as any
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

    return NextResponse.json({ person_id: personId, journey_id: journeyId }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
