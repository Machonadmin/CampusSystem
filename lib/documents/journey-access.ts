import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionPayload } from '@/lib/auth/jwt'
import { hasDocumentsPrivilege } from '@/lib/documents/permissions'
import { hasEducationPrivilege, type EducationPrivilege } from '@/lib/education/permissions'
import { journeyTarget } from '@/lib/education/journey-target'

/**
 * Комбинированная проверка доступа к документам, привязанным к journey.
 *
 * Доступ есть, если пользователь ЛИБО проходит привилегию модуля «Документы»
 * (прежнее поведение — НЕ ослабляется), ЛИБО авторизован в «Образовании» на
 * этой journey: superadmin, либо education-привилегия по статусу journey
 * (lead→manage/view_leads, applicant→…_applicants, иначе …_students) в её
 * подразделении (journeyTarget: у студентки primary, у лида и абитуриентки
 * desired; без подразделения — лид общий пул, остальные только scope='all').
 *
 * Студентка (principal='student') НИКОГДА не проходит эту проверку.
 *
 * Deploy-safe: если journey не найдена — доступ по education-ветке закрыт.
 */

type EduWriteScope = 'view' | 'manage'

/** Подбирает education-привилегию по education_status journey и типу доступа. */
function pickPrivilege(status: string | null, scope: EduWriteScope): EducationPrivilege {
  if (status === 'lead')      return scope === 'manage' ? 'manage_leads' : 'view_leads'
  if (status === 'applicant') return scope === 'manage' ? 'manage_applicants' : 'view_applicants'
  return scope === 'manage' ? 'manage_students' : 'view_students'
}

async function canDoJourneyDocs(
  session: SessionPayload | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>,
  journeyId: string,
  scope: EduWriteScope,
): Promise<boolean> {
  if (!session) return false

  // Документы модуля студентки не касаются — жёстко отсекаем.
  if (session.principal === 'student') return false

  // 1) Привилегия модуля «Документы» — прежнее поведение, НЕ ослабляем.
  if (await hasDocumentsPrivilege(session, scope)) return true

  // 2) superadmin — полный доступ.
  if (session.roles.includes('superadmin')) return true

  // 3) Education-авторизация на конкретной journey.
  const { data } = await sb
    .from('education_journeys')
    .select('education_status, primary_department_id, desired_department_id')
    .eq('id', journeyId)
    .maybeSingle()
  if (!data) return false

  const row = data as { education_status: string | null; primary_department_id: string | null; desired_department_id: string | null }
  // journeyTarget: абитуриентка/студентка без подразделения → только scope='all'
  // (red-team 2026-09-25: department-сотрудник скачивал и удалял паспорта/
  // медицинские сканы «ничьих» journeys всего института).
  return hasEducationPrivilege(session, pickPrivilege(row.education_status, scope), journeyTarget(row))
}

/** Может ли пользователь ДОБАВЛЯТЬ/УДАЛЯТЬ документы этой journey. */
export function canManageJourneyDocs(
  session: SessionPayload | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>,
  journeyId: string,
): Promise<boolean> {
  return canDoJourneyDocs(session, sb, journeyId, 'manage')
}

/** Может ли пользователь ПРОСМАТРИВАТЬ документы этой journey. */
export function canViewJourneyDocs(
  session: SessionPayload | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>,
  journeyId: string,
): Promise<boolean> {
  return canDoJourneyDocs(session, sb, journeyId, 'view')
}
