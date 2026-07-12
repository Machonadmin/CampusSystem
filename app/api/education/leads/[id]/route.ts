import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege, getEducationPrivilegeScope } from '@/lib/education/permissions'

/**
 * DELETE /api/education/leads/[id]
 * Soft-delete лида: устанавливает is_deleted=true, deleted_at, deleted_by.
 * Требует: manage_leads
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const sb = createServerClient()

    const { data: journey } = await sb
      .from('education_journeys')
      .select('id, person_id, education_status, primary_department_id, is_deleted')
      .eq('id', params.id)
      .maybeSingle()

    if (!journey) return apiError('lead_not_found', 404)
    if ((journey as unknown as { is_deleted: boolean }).is_deleted) {
      return apiError('lead_already_deleted', 409)
    }

    const leadDept = (journey as unknown as { primary_department_id: string | null }).primary_department_id
    await requireEducationPrivilege('manage_leads', {
      department_id: leadDept ?? undefined,
    })

    // F3: правка/удаление СУЩЕСТВУЮЩЕЙ записи без подразделения (dept-less lead)
    // разрешена только при scope='all'. Иначе department-scoped пользователь смог
    // бы удалять ЛЮБОГО «ничьего» лида. На создание это НЕ распространяется.
    if (leadDept == null) {
      const scope = await getEducationPrivilegeScope(session, 'manage_leads')
      if (scope !== 'all') {
        return apiError('forbidden', 403)
      }
    }

    const { error } = await sb
      .from('education_journeys')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: session.person_id } as any)
      .eq('id', params.id)

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
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
 * PATCH /api/education/leads/[id]
 * id = journey_id (education_status must be 'lead')
 * Единый endpoint: обновляет person + journey + interests + relatives + communities.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const body = await request.json() as {
      // Person fields
      last_name?: string | null
      first_name?: string
      middle_name?: string | null
      hebrew_name?: string | null
      gender?: string | null
      birth_date?: string | null
      marital_status?: string | null
      citizenship?: string | null
      passport_number?: string | null
      email?: string | null
      phones?: string[]
      address?: Record<string, unknown> | null
      // Journey fields
      referral_source?: string | null
      comment?: string | null
      // Interests (B1: delete+insert)
      interests?: { direction_id?: string | null; level_id?: string | null; free_text?: string | null }[]
      // Relatives (C1: diff)
      relatives?: { relative_id: string; relation_type: string; notes?: string | null }[]
      // Communities (delete+re-insert)
      communities?: CommunityPayload[]
    }

    const sb = createServerClient()

    const { data: journey } = await sb
      .from('education_journeys')
      .select('id, person_id, education_status, primary_department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (!journey) return apiError('journey_not_found', 404)
    if (journey.education_status !== 'lead') {
      return apiError('not_a_lead', 400)
    }

    await requireEducationPrivilege('manage_leads', {
      department_id: journey.primary_department_id ?? undefined,
    })

    // F3: правка СУЩЕСТВУЮЩЕЙ записи без подразделения (dept-less lead) разрешена
    // только при scope='all' (см. DELETE выше). На создание не распространяется.
    if (journey.primary_department_id == null) {
      const scope = await getEducationPrivilegeScope(session, 'manage_leads')
      if (scope !== 'all') {
        return apiError('forbidden', 403)
      }
    }

    const personId = journey.person_id

    // 1. Update person fields
    const personUpdate: Record<string, unknown> = {}
    if (body.first_name !== undefined)     personUpdate.first_name     = body.first_name?.trim() || null
    if (body.last_name !== undefined)      personUpdate.last_name      = body.last_name?.trim() || null
    if (body.middle_name !== undefined)    personUpdate.middle_name    = body.middle_name?.trim() || null
    if (body.hebrew_name !== undefined)    personUpdate.hebrew_name    = body.hebrew_name?.trim() || null
    if (body.gender !== undefined)         personUpdate.gender         = body.gender || null
    if (body.birth_date !== undefined)     personUpdate.birth_date     = body.birth_date || null
    if (body.email !== undefined)          personUpdate.email          = body.email?.trim() || null
    if (body.phones !== undefined)         personUpdate.phones         = (body.phones ?? []).filter(Boolean)
    if (body.address !== undefined)        personUpdate.address        = body.address
    if (body.marital_status !== undefined) personUpdate.marital_status = body.marital_status || null
    if (body.citizenship !== undefined)    personUpdate.nationality    = body.citizenship || null
    if (body.passport_number !== undefined)personUpdate.passport_number= body.passport_number?.trim() || null

    if (Object.keys(personUpdate).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: personErr } = await sb.from('persons').update(personUpdate as any).eq('id', personId)
      if (personErr) throw personErr
    }

    // 2. Update journey fields
    const journeyUpdate: Record<string, unknown> = {}
    if (body.referral_source !== undefined) journeyUpdate.referral_source = body.referral_source
    if (body.comment !== undefined)         journeyUpdate.notes           = body.comment?.trim() || null
    if (Object.keys(journeyUpdate).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await sb.from('education_journeys').update(journeyUpdate as any).eq('id', params.id)
    }

    // 3. Interests: B1 — DELETE + INSERT
    if (body.interests !== undefined) {
      await sb.from('lead_interests').delete().eq('person_id', personId)
      const validInterests = (body.interests ?? []).filter(i => i.direction_id || i.free_text?.trim())
      if (validInterests.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await sb.from('lead_interests').insert(validInterests.map(i => i.direction_id
          ? { person_id: personId, direction_id: i.direction_id, level_id: i.level_id ?? null, free_text: null }
          : { person_id: personId, direction_id: null, level_id: null, free_text: i.free_text?.trim() || null }
        ) as any)
      }
    }

    // 4. Relatives: C1 — diff (delete removed, insert new)
    if (body.relatives !== undefined) {
      const { data: existingRels } = await sb
        .from('person_relatives')
        .select('id, relative_id, relation_type')
        .eq('person_id', personId)

      const submittedSet = new Set((body.relatives ?? []).map(r => `${r.relative_id}:${r.relation_type}`))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingSet  = new Set((existingRels ?? [] as any[]).map((r: { relative_id: string; relation_type: string }) => `${r.relative_id}:${r.relation_type}`))

      for (const rel of existingRels ?? []) {
        if (!submittedSet.has(`${rel.relative_id}:${rel.relation_type}`)) {
          await sb.from('person_relatives').delete().eq('id', rel.id)
        }
      }
      for (const rel of body.relatives ?? []) {
        if (!rel.relative_id) continue
        if (!existingSet.has(`${rel.relative_id}:${rel.relation_type}`)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: _e1 } = await sb.from('person_relatives').insert({
            person_id: personId,
            relative_id: rel.relative_id,
            relation_type: rel.relation_type,
            notes: rel.notes ?? null,
          } as any)
          void _e1
        }
      }
    }

    // 5. Communities: DELETE all for journey + re-insert
    if (body.communities !== undefined) {
      await sb.from('journey_communities').delete().eq('journey_id', params.id)

      const validCommunities = (body.communities ?? []).filter(c =>
        (c.name?.trim() || c.contact_person?.trim() || c.phone?.trim()) &&
        c.country?.trim() && c.city?.trim()
      )
      for (const c of validCommunities) {
        const name    = c.name?.trim() || `Без названия — ${c.city?.trim()}`
        const country = c.country!.trim()
        const city    = c.city!.trim()

        const { data: existingComm } = await sb.from('communities')
          .select('id').eq('name', name).eq('city', city).eq('country', country).maybeSingle()

        let communityId: string
        if (existingComm) {
          communityId = existingComm.id
        } else {
          const { data: newComm, error: commErr } = await sb.from('communities')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .insert({
              name, name_he: null, country, city,
              default_contact_name: c.contact_person?.trim() || null,
              default_contact_role: c.position?.trim() || null,
              default_contact_phone: c.phone?.trim() || null,
              default_contact_email: c.email?.trim() || null,
              notes: null,
            } as any).select('id').single()
          if (commErr || !newComm) continue
          communityId = newComm.id
        }

        const extraNotes = (c.contacts ?? [])
          .filter(x => x.value?.trim())
          .map(x => `${x.type}: ${x.value}`)
          .join('; ') || null

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: _e2 } = await sb.from('journey_communities').insert({
          journey_id: params.id,
          community_id: communityId,
          contact_name: c.contact_person?.trim() || null,
          contact_role: c.position?.trim() || null,
          contact_phone: c.phone?.trim() || null,
          contact_email: c.email?.trim() || null,
          notes: extraNotes,
        } as any)
        void _e2
      }
    }

    // person_status_history — no change on edit
    void session

    return NextResponse.json({ ok: true, journey_id: params.id })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
