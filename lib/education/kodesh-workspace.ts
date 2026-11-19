import { createServerClient } from '@/lib/supabase/server'
import { getHeadedUnitIds } from '@/lib/education/unit-access'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'

type DeptLink = { id: string; parent_id: string | null }

/**
 * Все ли возглавляемые единицы — кодеш (сама кафедра иудаики или её потомки).
 * Чистая функция: headIds — единицы, где человек глава; depts — дерево
 * departments (id → parent_id). Пустой headIds → true (делегат кодеша без
 * собственного главенства — тоже «только кодеш»).
 */
export function headsOnlyKodeshUnits(headIds: string[], depts: DeptLink[]): boolean {
  const parentOf = new Map(depts.map(d => [d.id, d.parent_id]))
  const underKodesh = (id: string): boolean => {
    const seen = new Set<string>()
    let cur: string | null | undefined = id
    while (cur && !seen.has(cur)) {
      if (cur === KODESH_DEPT_ID) return true
      seen.add(cur)
      cur = parentOf.get(cur)
    }
    return false
  }
  return headIds.every(underKodesh)
}

/**
 * Возглавляет ли человек ТОЛЬКО кодеш (решение владельца 24.09.2026: «מרחב הקודש»
 * — только для того, кто отвечает за кодеш и ни за что больше). Глава кодеша,
 * который возглавляет и другие единицы (директор института), получает общее
 * пространство и видит светские учёбы. Fail-safe: ошибка чтения дерева → false
 * (общее пространство; доступ при этом не сужается).
 */
export async function headsOnlyKodesh(personId: string): Promise<boolean> {
  const heads = await getHeadedUnitIds(personId)
  const others = heads.filter(id => id !== KODESH_DEPT_ID)
  if (others.length === 0) return true
  try {
    const sb = createServerClient()
    const { data, error } = await sb.from('departments').select('id, parent_id')
    if (error) return false
    return headsOnlyKodeshUnits(others, (data ?? []) as DeptLink[])
  } catch {
    return false
  }
}
