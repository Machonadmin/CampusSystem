import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import {
  requireEducationPrivilege,
  hasEducationPrivilege,
  type EducationPrivilege,
} from '@/lib/education/permissions'
import LeadViewClient, { type LeadViewData } from '../../leads/[id]/LeadViewClient'
import type { StatusHistoryEntry } from '@/components/education/StudentLifecyclePanel'

interface Props {
  params: { id: string }
}

/** Статусы учебного цикла — карточка студента показывается только для них. */
const STUDENT_LIFECYCLE = ['student', 'on_leave', 'graduated', 'expelled']

type EduWriteScope = 'view' | 'manage'

/** Подбирает привилегию по education_status journey и типу доступа. */
function pickPrivilege(status: string | null, scope: EduWriteScope): EducationPrivilege {
  if (status === 'lead')      return scope === 'manage' ? 'manage_leads' : 'view_leads'
  if (status === 'applicant') return scope === 'manage' ? 'manage_applicants' : 'view_applicants'
  return scope === 'manage' ? 'manage_students' : 'view_students'
}

/** Преобразует Json-поле phones в плоский массив строк. */
function flattenPhones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(p => (typeof p === 'string' ? p : (p as { number?: string })?.number ?? ''))
    .filter(Boolean)
}

export default async function StudentViewPage({ params }: Props) {
  const session = await getSession()
  if (!session) redirect('/login')

  const sb = createServerClient()

  const { data: journey } = await sb
    .from('education_journeys')
    .select(`
      id, person_id, education_status, primary_department_id,
      specialty_id, main_group_id, year_level, year_start, enrolled_at,
      referral_source, notes, opened_at, application_date,
      person:persons!applicant_profiles_person_id_fkey(id, full_name, first_name, last_name, middle_name, hebrew_name,
        email, phones, gender, birth_date, address, marital_status, nationality, passport_number, photo_url),
      primary_department:departments!education_journeys_primary_department_id_fkey(id, name),
      specialty:specialties!education_journeys_specialty_id_fkey(id, name, code),
      main_group:study_groups(id, name, year_level)
    `)
    .eq('id', params.id)
    .maybeSingle()

  if (!journey) notFound()

  const j = journey as unknown as {
    id: string
    person_id: string
    education_status: string | null
    primary_department_id: string | null
    specialty_id: string | null
    main_group_id: string | null
    year_level: number | null
    year_start: number | null
    enrolled_at: string | null
    referral_source: string | null
    notes: string | null
    opened_at: string | null
    application_date: string | null
    person: {
      id: string
      full_name: string | null
      first_name: string | null
      last_name: string | null
      middle_name: string | null
      hebrew_name: string | null
      email: string | null
      phones: unknown
      gender: string | null
      birth_date: string | null
      address: Record<string, string> | null
      marital_status: string | null
      nationality: string | null
      passport_number: string | null
      photo_url: string | null
    } | null
    primary_department: { id: string; name: string } | null
    specialty: { id: string; name: string; code: string | null } | null
    main_group: { id: string; name: string; year_level: number | null } | null
  }

  const status = j.education_status

  // Не студент — перенаправляем на карточку лида/абитуриента (тот же LeadViewClient).
  if (!status || !STUDENT_LIFECYCLE.includes(status)) {
    redirect(`/dashboard/education/leads/${j.id}`)
  }

  const target = { department_id: j.primary_department_id ?? undefined }

  // Право на просмотр студента (бросает 403, если нет)
  await requireEducationPrivilege(pickPrivilege(status, 'view'), target)

  // Право на управление — гейтит вкладку «Учебный цикл» (переходы статуса)
  const canManage = await hasEducationPrivilege(session, pickPrivilege(status, 'manage'), target)

  // Доп. данные: направления, общины, родственники, история статусов
  const [{ data: interests }, { data: communities }, { data: relatives }, { data: history }] = await Promise.all([
    sb.from('lead_interests')
      .select('free_text, direction:reference_directions(name_ru, department:departments(name)), level:reference_levels(name_ru)')
      .eq('person_id', j.person_id),
    sb.from('journey_communities')
      .select('community_id, contact_name, contact_role, contact_phone, contact_email, notes, community:communities(id, name, country, city)')
      .eq('journey_id', j.id),
    sb.from('person_relatives')
      .select('relation_type, notes, relative:persons!person_relatives_relative_id_fkey(id, full_name)')
      .eq('person_id', j.person_id)
      .order('created_at', { ascending: true }),
    sb.from('person_status_history')
      .select('from_status, to_status, changed_at, comment')
      .eq('person_id', j.person_id)
      .order('changed_at', { ascending: false }),
  ])

  const p = j.person

  const data: LeadViewData = {
    journeyId: j.id,
    personId: j.person_id,
    status: j.education_status,
    createdAt: j.opened_at ?? j.application_date,
    departmentName: j.primary_department?.name ?? null,
    person: {
      full_name: p?.full_name ?? '',
      first_name: p?.first_name ?? null,
      last_name: p?.last_name ?? null,
      middle_name: p?.middle_name ?? null,
      hebrew_name: p?.hebrew_name ?? null,
      birth_date: p?.birth_date ?? null,
      gender: p?.gender ?? null,
      marital_status: p?.marital_status ?? null,
      nationality: p?.nationality ?? null,
      passport_number: p?.passport_number ?? null,
      email: p?.email ?? null,
      phones: flattenPhones(p?.phones),
      address: p?.address ?? null,
      photo_url: p?.photo_url ?? null,
    },
    interests: (interests ?? []).map(i => {
      const dir = (i.direction as unknown) as { name_ru: string; department: { name: string } | null } | null
      const lvl = (i.level as unknown) as { name_ru: string } | null
      return {
        free_text: i.free_text,
        direction_name: dir?.name_ru ?? null,
        level_name: lvl?.name_ru ?? null,
        department_name: dir?.department?.name ?? null,
      }
    }),
    communities: (communities ?? []).map(c => {
      const comm = (c.community as unknown) as { name: string; country: string | null; city: string | null } | null
      return {
        name: comm?.name ?? '',
        country: comm?.country ?? null,
        city: comm?.city ?? null,
        contact_name: c.contact_name,
        contact_role: c.contact_role,
        contact_phone: c.contact_phone,
        contact_email: c.contact_email,
        notes: c.notes,
      }
    }),
    relatives: (relatives ?? []).map(r => {
      const rel = (r.relative as unknown) as { full_name: string | null } | null
      return {
        relation_type: r.relation_type,
        full_name: rel?.full_name ?? '',
        notes: r.notes,
      }
    }),
    referral_source: j.referral_source,
    comment: j.notes,
    academic: {
      departmentName: j.primary_department?.name ?? null,
      specialtyName: j.specialty
        ? (j.specialty.code ? `[${j.specialty.code}] ${j.specialty.name}` : j.specialty.name)
        : null,
      groupName: j.main_group?.name ?? null,
      yearLevel: j.year_level,
      yearStart: j.year_start,
      enrolledAt: j.enrolled_at,
    },
  }

  const historyEntries: StatusHistoryEntry[] = (history ?? []).map(h => ({
    from_status: h.from_status,
    to_status: h.to_status,
    changed_at: h.changed_at,
    comment: h.comment,
  }))

  return (
    <LeadViewClient
      data={data}
      showEditButton={false}
      canManage={canManage}
      canConvert={false}
      studyLifecycle={{ history: historyEntries }}
      showReport
      showOverview
      routeBase="students"
    />
  )
}
