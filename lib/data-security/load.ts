import { createServerClient } from '@/lib/supabase/server'
import { localizedDeptName } from '@/lib/departments/localized-name'
import { getUserDepartmentIds } from '@/lib/education/permissions'
import type { Lang } from '@/lib/i18n/translations'
import type { PrivilegeModule } from '@/types/database'
import {
  buildTree, privilegeKey,
  type BuiltTree, type CatalogEntryInput, type NodeInput, type ItemInput,
} from './tree'
import { resolvePersonPrivileges, type ResolvedPrivilege } from './person'
import { pickLang } from './localize'

// ─── Загрузка данных экрана «Безопасность данных» ────────────────────────────
//
// Читает каталог прав, дерево отображения и фактические права человека. Ничего
// не выдаёт и не отзывает — это read-модуль экрана.

const CATALOG_COLUMNS =
  'module, privilege_code, name_he, name_ru, name_en, ' +
  'description_he, description_ru, description_en, ' +
  'level, risk, allowed_scopes, is_legacy, superseded_by, sort_order'

const NODE_COLUMNS =
  'id, parent_id, sort_order, name_he, name_ru, name_en, ' +
  'description_he, description_ru, description_en, ' +
  'module_code, icon, color, department_id'

/** Каталог прав целиком. Устаревшие дубли не отбрасываются — их прячет экран. */
export async function loadCatalog(): Promise<CatalogEntryInput[]> {
  const sb = createServerClient()
  const { data, error } = await sb
    .from('module_privileges')
    .select(CATALOG_COLUMNS)
    .order('module')
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as unknown as CatalogEntryInput[]
}

/**
 * Дерево отображения, собранное для языка пользователя.
 *
 * Деплой-безопасно: пока миграция дерева не применена, таблиц нет — тогда
 * возвращается пустое дерево, и ВЕСЬ каталог попадает в «не распределено».
 * Экран при этом работает и показывает все права, просто плоским списком; это
 * лучше, чем пустая страница.
 */
export async function loadTree(lang: Lang): Promise<BuiltTree> {
  const sb = createServerClient()
  const catalog = await loadCatalog()

  let nodes: NodeInput[] = []
  let items: ItemInput[] = []
  try {
    const [nodesRes, itemsRes] = await Promise.all([
      sb.from('security_tree_nodes').select(NODE_COLUMNS).order('sort_order'),
      sb.from('security_tree_items').select('node_id, module, privilege_code, sort_order'),
    ])
    if (nodesRes.error) throw nodesRes.error
    if (itemsRes.error) throw itemsRes.error
    nodes = (nodesRes.data ?? []) as unknown as NodeInput[]
    items = (itemsRes.data ?? []) as unknown as ItemInput[]
  } catch {
    // Таблиц ещё нет — работаем на одном каталоге.
  }

  return buildTree(lang, nodes, items, catalog)
}

export interface StaffSummary {
  personId: string
  name: string
  loginEmail: string | null
  isActive: boolean
  lastLogin: string | null
  /** Подпись должности; техническим кодом роли она не бывает. */
  positionTitle: string | null
}

/** Сотрудники с учётной записью — левый список экрана «по сотруднику». */
export async function loadStaffList(lang: Lang): Promise<StaffSummary[]> {
  const sb = createServerClient()

  const { data: accounts, error } = await sb
    .from('person_accounts')
    .select('person_id, login_email, is_active, last_login')
  if (error) throw error

  const personIds = [...new Set((accounts ?? []).map(a => a.person_id))]
  if (personIds.length === 0) return []

  const [{ data: persons }, { data: positions }] = await Promise.all([
    sb.from('persons').select('id, full_name, hebrew_name').in('id', personIds),
    sb.from('staff_positions')
      .select('person_id, position_ru, position_he, end_date, is_head')
      .in('person_id', personIds)
      .is('end_date', null),
  ])

  const nameOf = (id: string) => {
    const p = persons?.find(x => x.id === id)
    if (!p) return ''
    return (lang === 'he' && p.hebrew_name) ? p.hebrew_name : (p.full_name ?? '')
  }

  const titleOf = (id: string) => {
    const rows = (positions ?? []).filter(x => x.person_id === id)
    const head = rows.find(r => r.is_head) ?? rows[0]
    if (!head) return null
    return pickLang(lang, { he: head.position_he, ru: head.position_ru, en: null })
  }

  return (accounts ?? [])
    .map(a => ({
      personId: a.person_id,
      name: nameOf(a.person_id),
      loginEmail: a.login_email,
      isActive: a.is_active,
      lastLogin: a.last_login,
      positionTitle: titleOf(a.person_id),
    }))
    .sort((x, y) => x.name.localeCompare(y.name))
}

export interface PersonAccess {
  personId: string
  name: string
  positionTitle: string | null
  /** Подписи подразделений, в которых человек сидит, — они задают область. */
  departments: { id: string; name: string }[]
  /** Роли человека: подписи, не коды. */
  roles: { id: string; name: string }[]
  privileges: ResolvedPrivilege[]
}

/**
 * Фактические права человека — тем же расчётом, что и при проверке доступа.
 * Подразделения подгружаются отдельно: именно они превращают scope=department
 * в понятное «только лимудей кодеш» на экране.
 */
export async function loadPersonAccess(personId: string, lang: Lang): Promise<PersonAccess | null> {
  const sb = createServerClient()

  const { data: person } = await sb
    .from('persons')
    .select('id, full_name, hebrew_name')
    .eq('id', personId)
    .maybeSingle()
  if (!person) return null

  const { data: personRoleRows } = await sb
    .from('person_roles')
    .select('role_id')
    .eq('person_id', personId)
  const roleIds = [...new Set((personRoleRows ?? []).map(r => r.role_id))]

  const { data: roleRows } = roleIds.length
    ? await sb.from('roles').select('id, name, code').in('id', roleIds)
    : { data: [] as { id: string; name: string; code: string }[] }

  const { data: rolePrivileges } = roleIds.length
    ? await sb.from('role_privileges').select('module, privilege_code, scope').in('role_id', roleIds)
    : { data: [] as { module: string; privilege_code: string; scope: string }[] }

  let personPrivileges: { module: string; privilege_code: string; is_granted: boolean; expires_at: string | null }[] = []
  try {
    const { data } = await sb
      .from('person_privileges')
      .select('module, privilege_code, is_granted, expires_at')
      .eq('person_id', personId)
    personPrivileges = (data ?? []) as typeof personPrivileges
  } catch { /* таблицы нет — остаёмся на ролевых правах */ }

  const deptIds = await getUserDepartmentIds(personId)
  const { data: depts } = deptIds.length
    ? await sb.from('departments').select('id, name, name_he, name_en').in('id', deptIds)
    : { data: [] as { id: string; name: string; name_he: string | null; name_en: string | null }[] }

  const { data: positions } = await sb
    .from('staff_positions')
    .select('position_ru, position_he, is_head')
    .eq('person_id', personId)
    .is('end_date', null)
    .order('is_head', { ascending: false })
    .limit(1)

  const pos = positions?.[0]

  return {
    personId,
    name: (lang === 'he' && person.hebrew_name) ? person.hebrew_name : (person.full_name ?? ''),
    positionTitle: pos ? pickLang(lang, { he: pos.position_he, ru: pos.position_ru, en: null }) : null,
    departments: (depts ?? []).map(d => ({
      id: d.id,
      name: localizedDeptName(d, lang),
    })),
    roles: (roleRows ?? []).map(r => ({ id: r.id, name: r.name })),
    privileges: resolvePersonPrivileges(
      (rolePrivileges ?? []) as { module: string; privilege_code: string; scope: string }[],
      personPrivileges,
      Date.now(),
    ),
  }
}

/**
 * Кто СЕЙЧАС держит конкретное право — для карточки права на общем экране.
 * Возвращает подписи ролей и имена людей, а не технические коды.
 */
export async function loadPrivilegeHolders(
  module: string,
  code: string,
  lang: Lang,
): Promise<{ roles: string[]; people: string[] }> {
  const sb = createServerClient()

  const { data: rp } = await sb
    .from('role_privileges')
    .select('role_id')
    .eq('module', module as PrivilegeModule)
    .eq('privilege_code', code)
  const roleIds = [...new Set((rp ?? []).map(r => r.role_id))]

  const { data: roles } = roleIds.length
    ? await sb.from('roles').select('id, name').in('id', roleIds)
    : { data: [] as { id: string; name: string }[] }

  let people: string[] = []
  try {
    const { data: pp } = await sb
      .from('person_privileges')
      .select('person_id, is_granted, expires_at')
      .eq('module', module as PrivilegeModule)
      .eq('privilege_code', code)
      .eq('is_granted', true)
    const now = Date.now()
    const ids = [...new Set((pp ?? [])
      .filter(p => !p.expires_at || new Date(p.expires_at).getTime() > now)
      .map(p => p.person_id))]
    if (ids.length) {
      const { data: persons } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', ids)
      people = (persons ?? []).map(p => (lang === 'he' && p.hebrew_name) ? p.hebrew_name : (p.full_name ?? ''))
    }
  } catch { /* таблицы нет — личных держателей нет */ }

  return {
    roles: (roles ?? []).map(r => r.name).sort((a, b) => a.localeCompare(b)),
    people: people.sort((a, b) => a.localeCompare(b)),
  }
}

export { privilegeKey }
