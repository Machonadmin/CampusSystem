import { NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { getCookieLocale } from '@/lib/i18n/locale'
import { getSession } from '@/lib/auth/session'
import { createServerClient } from '@/lib/supabase/server'
import { isChavrutaTeacher } from '@/lib/chavruta/teachers'
import { canViewChavruta } from '@/lib/chavruta/access'
import type { RoleCode } from '@/types/database'

const ALL_MODULE_CODES = [
  'persons', 'staff', 'quality_control', 'education', 'jewishness', 'finance', 'dormitory', 'food',
  'security', 'alumni', 'sponsors', 'tasks', 'documents', 'reports',
  'contacts', 'settings', 'doctor', 'psychologist', 'maintenance',
]

type FeaturePerms = { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }
type FeatureAccess = Record<string, Record<string, FeaturePerms>>

const ALL_FEATURE_PERMS: FeaturePerms = { can_view: true, can_create: true, can_edit: true, can_delete: true }

const ALL_FEATURES: FeatureAccess = {
  quality_control: {
    planned:   ALL_FEATURE_PERMS,
    history:   ALL_FEATURE_PERMS,
    templates: ALL_FEATURE_PERMS,
  },
}

export async function GET() {
  const session = await getSession()
  if (!session) return apiError('unauthorized', 401)

  let accessible_modules: string[]
  let feature_access: FeatureAccess
  // Хеврута — не обычный модуль (доступ динамический: кодеш ∪ ручные), поэтому
  // отдаём отдельным флагом; сайдбар по нему показывает ссылку «Хеврута».
  let is_chavruta_teacher = false

  if (session.roles.includes('superadmin')) {
    accessible_modules = ALL_MODULE_CODES
    feature_access = ALL_FEATURES
    is_chavruta_teacher = true
  } else {
    const sb = createServerClient()
    try { is_chavruta_teacher = await isChavrutaTeacher(sb, session.person_id) } catch { /* деплой-безопасно */ }
    const { data: roleRows } = await sb.from('roles').select('id').in('code', session.roles as RoleCode[])
    const roleIds = (roleRows ?? []).map(r => r.id)

    if (roleIds.length === 0) {
      accessible_modules = []
      feature_access = {}
    } else {
      const { data: privs } = await sb
        .from('role_privileges')
        .select('module')
        .in('role_id', roleIds)
        .eq('privilege_code', 'access')
      accessible_modules = [...new Set((privs ?? []).map(p => p.module as string))]

      const { data: featRows } = await sb
        .from('feature_privileges')
        .select('module_code, feature_code, can_view, can_create, can_edit, can_delete')
        .in('role_code', session.roles)
      feature_access = {}
      for (const row of featRows ?? []) {
        if (!feature_access[row.module_code]) feature_access[row.module_code] = {}
        const existing = feature_access[row.module_code][row.feature_code]
        feature_access[row.module_code][row.feature_code] = {
          can_view:   (existing?.can_view   ?? false) || row.can_view,
          can_create: (existing?.can_create ?? false) || row.can_create,
          can_edit:   (existing?.can_edit   ?? false) || row.can_edit,
          can_delete: (existing?.can_delete ?? false) || row.can_delete,
        }
      }
    }

    // Персональные оверрайды доступа к МОДУЛЮ (grant/deny) поверх ролей —
    // платформенно, как в модульных permissions.ts. Работают и без ролей.
    try {
      const { data: pAccess } = await sb
        .from('person_privileges')
        .select('module, is_granted, expires_at')
        .eq('person_id', session.person_id)
        .eq('privilege_code', 'access')
      const nowMs = Date.now()
      const set = new Set(accessible_modules)
      for (const r of (pAccess ?? []) as Array<{ module: string; is_granted: boolean; expires_at: string | null }>) {
        if (r.expires_at && new Date(r.expires_at).getTime() <= nowMs) continue
        if (r.is_granted) set.add(r.module); else set.delete(r.module)
      }
      accessible_modules = [...set]
    } catch { /* нет таблицы — оставляем ролевой список */ }
  }

  // Должность-ярлык для подписи в шапке (напр. «מזכירת טורו»). Живой запрос
  // текущей должности + reference_positions, язык — из cookie, с падением на
  // снапшот position_ru/position_he. Deploy-безопасно (при любой ошибке — null).
  let position_title: string | null = null
  try {
    const sb2 = createServerClient()
    const { data: pos } = await sb2
      .from('staff_positions')
      .select('position_ru, position_he, position_id')
      .eq('person_id', session.person_id)
      .is('end_date', null)
      .order('is_head', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (pos) {
      const p = pos as { position_ru: string | null; position_he: string | null; position_id: string | null }
      let refRu: string | null = null
      let refHe: string | null = null
      if (p.position_id) {
        const { data: rp } = await sb2
          .from('reference_positions')
          .select('name_ru, name_he')
          .eq('id', p.position_id)
          .maybeSingle()
        const r = rp as { name_ru: string | null; name_he: string | null } | null
        refRu = r?.name_ru ?? null
        refHe = r?.name_he ?? null
      }
      const lang = getCookieLocale()
      position_title = lang === 'he'
        ? (refHe || p.position_he || refRu || p.position_ru || null)
        : (refRu || p.position_ru || null)
    }
  } catch { /* deploy-безопасно */ }

  // «מרכז חברותא» — управляющий хаб (не журнал преподавателя). Доступ у
  // менеджера (staff-comp / manage_students), даже если он НЕ мора хавруты и у
  // роли нет модуля 'chavruta'. Отдаём флагом, чтобы сайдбар/главная показали
  // ссылку (иначе хаб навигационно недостижим).
  let can_view_chavruta = false
  try { can_view_chavruta = await canViewChavruta(session) } catch { /* deploy-безопасно */ }

  return NextResponse.json({
    person_id: session.person_id,
    login_email: session.login_email,
    full_name: session.full_name,
    roles: session.roles,
    position_title,
    accessible_modules,
    feature_access,
    is_chavruta_teacher,
    can_view_chavruta,
  })
}
