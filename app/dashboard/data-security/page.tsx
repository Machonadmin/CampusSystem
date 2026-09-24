import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getCookieLocale } from '@/lib/i18n/locale'
import { createServerClient } from '@/lib/supabase/server'
import { localizedDeptName } from '@/lib/departments/localized-name'
import { diagnoseModuleAccess, type ModulePrivilegeCheck } from '@/lib/permissions/diagnose'
import NoModuleAccess from '@/components/dashboard/NoModuleAccess'
import {
  hasDataSecurityPrivilege, getDataSecurityAbilities,
} from '@/lib/data-security/permissions'
import { loadTree, loadStaffList } from '@/lib/data-security/load'
import { buildUnitTree, type DepartmentInput, type SeatInput } from '@/lib/data-security/units'
import { todayISO } from '@/lib/dates'
import { getHeadScope, pruneTreeToGrantable, pruneUnitsToHeaded } from '@/lib/data-security/head-scope'
import DataSecurityClient from './DataSecurityClient'

/**
 * «Безопасность данных» — единственное место, где видно и настраивается, кто
 * что видит во всей системе.
 *
 * Гейт — 'access'. Отдельно считаются 'grant' (выдавать права) и 'manage_tree'
 * (наводить порядок в структуре): экран получает их готовыми с сервера и не
 * решает сам, что человеку можно, — иначе он мог бы ошибиться в свою пользу.
 */
export default async function DataSecurityPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasDataSecurityPrivilege(session, 'access')
  // Глава отдела без 'access' получает ограниченный режим: только его команда
  // и только права, которые есть у него самого (lib/data-security/head-scope.ts).
  // Сервер проверяет то же самое в /api/data-security/person/[personId].
  const headScope = canView ? null : await getHeadScope(session)
  if (!canView && !headScope) {
    // Не молчаливый редирект: он неотличим от поломки. Экран называет
    // недостающее право и место, где его выдать.
    const diagnosis = await diagnoseModuleAccess(
      session, 'data_security', hasDataSecurityPrivilege as unknown as ModulePrivilegeCheck,
    )
    return <NoModuleAccess module="data_security" required="access" diagnosis={diagnosis} />
  }

  const lang = getCookieLocale()
  const abilities = await getDataSecurityAbilities(session)

  const sb = createServerClient()
  const [tree, staff, deptRes, seatRes] = await Promise.all([
    loadTree(lang),
    loadStaffList(lang),
    sb.from('departments')
      .select('id, name, name_he, name_en, parent_id, sort_order, is_educational_institution')
      .order('name'),
    sb.from('staff_positions').select('person_id, department_id, is_head, end_date'),
  ])

  const departments = (deptRes.data ?? []).map(d => ({
    id: d.id,
    name: localizedDeptName(d, lang),
  }))

  // Единицы — настоящая граница доступа: посаженный на единицу видит её и всё,
  // что ниже. Экран показывает их рядом с правами именно поэтому.
  const units = buildUnitTree(
    lang,
    (deptRes.data ?? []) as unknown as DepartmentInput[],
    (seatRes.data ?? []) as unknown as SeatInput[],
    todayISO(),
  )

  if (headScope) {
    // Ограниченный режим: общий вид скрыт, посадка не правится, список людей —
    // только команда, дерево — только выдаваемое, единицы — только его ветки.
    return (
      <DataSecurityClient
        initialTree={pruneTreeToGrantable(tree, headScope.grantable)}
        initialUnits={pruneUnitsToHeaded(units, headScope.headedUnitIds)}
        staff={staff.filter(s => headScope.personIds.has(s.personId))}
        departments={[]}
        canGrant
        canManageTree={false}
        canManageUnits={false}
        limited
      />
    )
  }

  return (
    <DataSecurityClient
      initialTree={tree}
      initialUnits={units}
      staff={staff}
      departments={departments}
      canGrant={abilities.canGrant}
      canManageTree={abilities.canManageTree}
      canManageUnits={abilities.canManageUnits}
    />
  )
}
