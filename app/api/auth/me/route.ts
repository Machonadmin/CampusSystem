import { NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { getCookieLocale } from '@/lib/i18n/locale'
import { getSession } from '@/lib/auth/session'
import { createServerClient } from '@/lib/supabase/server'
import { effectivePrivileges, visibleModules } from '@/lib/permissions/module-gates'
import { isChavrutaTeacher } from '@/lib/chavruta/teachers'
import { canViewChavruta } from '@/lib/chavruta/access'
import { canViewStaffComp } from '@/lib/finance/staff-comp'
import { ALL_MODULE_CODES as REGISTRY_ALL_MODULE_CODES } from '@/lib/modules/registry'
import type { RoleCode } from '@/types/database'
import { getHeadedUnitIds } from '@/lib/education/unit-access'

// Список модулей, которые видит superadmin. Берётся из реестра модулей
// (lib/modules/registry.ts) — единственного источника правды; раньше жил здесь
// копией и разошёлся с middleware (там не было tasks) и с палитрой.
// Копия, а не readonly-ссылка: accessible_modules ниже — обычный string[].
const ALL_MODULE_CODES: string[] = [...REGISTRY_ALL_MODULE_CODES]

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

    // Собираются здесь, применяются ниже вместе с персональными оверрайдами:
    // оверрайд может дать доступ и человеку вообще без ролей.
    let rolePrivilegeRows: { module: string; privilege_code: string }[] = []

    if (roleIds.length === 0) {
      feature_access = {}
    } else {
      // Берём ВСЕ привилегии ролей, а не только 'access': видимость модуля
      // теперь означает «сможет войти», а вход у части модулей требует ещё и
      // '<module>.view' (см. lib/permissions/module-gates.ts).
      const { data: privs } = await sb
        .from('role_privileges')
        .select('module, privilege_code')
        .in('role_id', roleIds)
      rolePrivilegeRows = (privs ?? []) as { module: string; privilege_code: string }[]

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

    // Персональные оверрайды поверх ролей (grant добавляет, deny отнимает) —
    // платформенно, как в модульных permissions.ts. Работают и без ролей.
    let personPrivilegeRows: Array<{ module: string; privilege_code: string; is_granted: boolean; expires_at: string | null }> = []
    try {
      const { data: pRows } = await sb
        .from('person_privileges')
        .select('module, privilege_code, is_granted, expires_at')
        .eq('person_id', session.person_id)
      personPrivilegeRows = (pRows ?? []) as typeof personPrivilegeRows
    } catch { /* нет таблицы — остаёмся на ролевом списке */ }

    // «Видит ⇔ может войти»: модуль попадает в список, только если у человека
    // есть и 'access' (плитка/меню), и право, которое требует сама страница.
    // Раньше здесь учитывался только 'access', из-за чего модуль мог быть виден
    // и при этом молча не открываться.
    accessible_modules = visibleModules(
      effectivePrivileges(rolePrivilegeRows, personPrivilegeRows, Date.now()),
    )

    // Глава отдела видит «אבטחת מידע» в ограниченном режиме (своя команда и
    // только свои права) — пункт меню нужен и ему. Права модуля при этом НЕ
    // выдаются: страница и маршруты сами считают область главы
    // (lib/data-security/head-scope.ts). Fail-closed: ошибка → пункта нет.
    if (!accessible_modules.includes('data_security') && session.principal !== 'student') {
      try {
        if ((await getHeadedUnitIds(session.person_id)).length > 0) {
          accessible_modules = [...accessible_modules, 'data_security']
        }
      } catch { /* fail-closed */ }
    }

    // «בקרת איכות»: список проверок (/api/quality-control) пускает только при
    // feature_privileges quality_control.planned|history.can_view. Одного
    // модульного 'access' мало — без фичи человек видел пункт меню и плитку,
    // а страница отвечала 403. Видит ⇔ может открыть (решение владельца).
    const qc = feature_access.quality_control
    if (!(qc?.planned?.can_view || qc?.history?.can_view)) {
      accessible_modules = accessible_modules.filter(m => m !== 'quality_control')
    }
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

  // Имя для приветствия на главной. full_name хранится как «Фамилия Имя …», и
  // главная брала первое слово — здоровалась по ФАМИЛИИ («ברוך הבא, כהן!»).
  // Отдаём first_name отдельно. Ошибка чтения → null (главная просто без имени).
  let first_name: string | null = null
  try {
    const sb3 = createServerClient()
    const { data: pr } = await sb3.from('persons').select('first_name').eq('id', session.person_id).maybeSingle()
    first_name = ((pr as { first_name: string | null } | null)?.first_name ?? '').trim() || null
  } catch { /* deploy-безопасно */ }

  // «מרכז חברותא» — управляющий хаб (не журнал преподавателя). Доступ у
  // менеджера (staff-comp / manage_students), даже если он НЕ мора хавруты и у
  // роли нет модуля 'chavruta'. Отдаём флагом, чтобы сайдбар/главная показали
  // ссылку (иначе хаб навигационно недостижим).
  let can_view_chavruta = false
  try { can_view_chavruta = await canViewChavruta(session) } catch { /* deploy-безопасно */ }

  // «שכר צוות» (расчётные листы) — экраны /dashboard/finance/staff гейтятся
  // canViewStaffComp (superadmin | finance.view), но в меню их не было вовсе.
  // Отдаём флагом, чтобы сайдбар показал пункт тем, у кого доступ есть.
  // Fail-closed: любая ошибка → false (пункт скрыт).
  let can_view_staff_comp = false
  try { can_view_staff_comp = await canViewStaffComp(session) } catch { /* fail-closed */ }

  return NextResponse.json({
    person_id: session.person_id,
    login_email: session.login_email,
    full_name: session.full_name,
    first_name,
    roles: session.roles,
    position_title,
    accessible_modules,
    feature_access,
    is_chavruta_teacher,
    can_view_chavruta,
    can_view_staff_comp,
  })
}
