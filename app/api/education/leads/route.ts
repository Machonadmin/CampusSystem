import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

async function guard() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

export async function GET() {
  try {
    await guard()
    const sb = createServerClient()

    const { data: profiles, error: pErr } = await sb
      .from('applicant_profiles')
      .select('id, person_id, referral_source, application_date, notes')
      .eq('education_status', 'lead')
      .order('application_date', { ascending: false })

    if (pErr) throw pErr
    if (!profiles || profiles.length === 0) return NextResponse.json([])

    const personIds = profiles.map(p => p.person_id)

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

    const result = profiles.map(profile => {
      const person = personMap.get(profile.person_id)
      return {
        profile_id: profile.id,
        person_id: profile.person_id,
        full_name: person?.full_name ?? '',
        email: person?.email ?? null,
        phones: (person?.phones as string[]) ?? [],
        photo_url: person?.photo_url ?? null,
        referral_source: profile.referral_source ?? null,
        application_date: profile.application_date ?? null,
        interests: interestMap.get(profile.person_id) ?? [],
      }
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await guard()
    const sb = createServerClient()
    const body = await request.json() as {
      person_id?: string
      full_name?: string
      phone?: string
      email?: string
      gender?: string
      birth_date?: string
      interests?: { institution: string; direction?: string }[]
      referral_source?: string
      comment?: string
    }

    let personId: string

    if (body.person_id) {
      const { data: person } = await sb.from('persons').select('id').eq('id', body.person_id).single()
      if (!person) return NextResponse.json({ error: 'Человек не найден' }, { status: 404 })
      personId = person.id
      await sb.from('persons').update({ education_status: 'lead' }).eq('id', personId)
    } else {
      if (!body.full_name?.trim()) return NextResponse.json({ error: 'ФИО обязательно' }, { status: 400 })
      if (!body.phone?.trim()) return NextResponse.json({ error: 'Телефон обязателен' }, { status: 400 })

      const { data: newPerson, error: personErr } = await sb
        .from('persons')
        .insert({
          full_name: body.full_name.trim(),
          hebrew_name: null,
          phones: body.phone ? [body.phone.trim()] : [],
          email: body.email?.trim() || null,
          gender: (body.gender as 'male' | 'female' | 'other') || null,
          birth_date: body.birth_date || null,
          photo_url: null,
          address: {},
          notes: null,
          education_status: 'lead',
        })
        .select('id')
        .single()

      if (personErr || !newPerson) throw personErr ?? new Error('Ошибка создания')
      personId = newPerson.id
    }

    // Check if applicant_profile already exists
    const { data: existing } = await sb
      .from('applicant_profiles')
      .select('id, education_status')
      .eq('person_id', personId)
      .maybeSingle()

    if (existing) {
      if (existing.education_status !== 'lead') {
        return NextResponse.json({ error: 'У этого человека уже есть другой статус' }, { status: 409 })
      }
    } else {
      const { error: profileErr } = await sb.from('applicant_profiles').insert({
        person_id: personId,
        status: 'new',
        education_status: 'lead',
        referral_source: body.referral_source || null,
        notes: body.comment || null,
        application_date: new Date().toISOString().split('T')[0],
        community_contact_name: null,
        community_contact_role: null,
        community_phone: null,
        community_email: null,
      })
      if (profileErr) throw profileErr
    }

    // Insert lead interests
    const validInterests = (body.interests ?? []).filter(i => i.institution)
    if (validInterests.length > 0) {
      await sb.from('lead_interests').insert(
        validInterests.map(i => ({
          person_id: personId,
          institution: i.institution,
          direction: i.direction?.trim() || null,
        }))
      )
    }

    // Status history
    await sb.from('person_status_history').insert({
      person_id: personId,
      from_status: null,
      to_status: 'lead',
      changed_by: session.person_id,
    })

    return NextResponse.json({ person_id: personId }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
