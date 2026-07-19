import { NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'
import { createServerClient } from '@/lib/supabase/server'
import { isChavrutaTeacher } from '@/lib/chavruta/teachers'
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
  }

  return NextResponse.json({
    person_id: session.person_id,
    login_email: session.login_email,
    full_name: session.full_name,
    roles: session.roles,
    accessible_modules,
    feature_access,
    is_chavruta_teacher,
  })
}
