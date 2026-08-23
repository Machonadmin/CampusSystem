import { createServerClient } from '@/lib/supabase/server'

/**
 * Иерархия «кто выше кого» — по дереву подразделений (по решению владельца).
 * Прямого поля «руководитель» (reports_to/manager_id) в системе нет, поэтому
 * старшинство выводим структурно:
 *
 *   Человек B «выше» человека A, если B возглавляет подразделение A ИЛИ любое
 *   родительское подразделение над ним (departments.parent_id вверх).
 *
 * «Возглавляет» = departments.head_person_id ИЛИ активная позиция
 * staff_positions.is_head в этом подразделении.
 *
 * Деплой-безопасно: при любой ошибке/нехватке данных возвращаем false
 * («не выше») — чтобы неопределённость НЕ блокировала встречи по ошибке.
 */

const today = () => new Date().toISOString().slice(0, 10)

/** Активные подразделения человека (позиция не закрыта). */
async function activeDeptIds(sb: ReturnType<typeof createServerClient>, personId: string): Promise<string[]> {
  const { data } = await sb
    .from('staff_positions')
    .select('department_id, end_date')
    .eq('person_id', personId)
  const t = today()
  const ids = new Set<string>()
  for (const r of (data ?? []) as Array<{ department_id: string | null; end_date: string | null }>) {
    if (r.department_id && (r.end_date === null || r.end_date > t)) ids.add(r.department_id)
  }
  return [...ids]
}

/** Поднимается по parent_id, собирая сами подразделения + всех предков (цикло-безопасно). */
async function withAncestors(sb: ReturnType<typeof createServerClient>, deptIds: string[]): Promise<Set<string>> {
  const { data } = await sb.from('departments').select('id, parent_id')
  const parent = new Map<string, string | null>()
  for (const d of (data ?? []) as Array<{ id: string; parent_id: string | null }>) parent.set(d.id, d.parent_id ?? null)

  const result = new Set<string>()
  for (const start of deptIds) {
    let cur: string | null = start
    let guard = 0
    while (cur && !result.has(cur) && guard < 100) {
      result.add(cur)
      cur = parent.get(cur) ?? null
      guard++
    }
  }
  return result
}

/**
 * Пакетная версия isAboveInHierarchy для ОДНОГО candidate и МНОЖЕСТВА subjects
 * (напр. проверка списка участников встречи против её создателя). Возвращает
 * множество subjectPersonId, которые «ниже» candidate.
 *
 * Вместо ~4 запросов и полного скана departments НА КАЖДОГО subject — считаем
 * «домен» candidate один раз: подразделения, которые он возглавляет (head_person_id
 * или активный is_head), развёрнутые ВНИЗ до всех потомков. Subject «ниже», если
 * любое из его активных подразделений входит в домен. Итого 3 запроса на весь
 * список. Деплой-безопасно: при ошибке возвращаем пустое множество.
 */
export async function subjectsBelow(candidatePersonId: string, subjectPersonIds: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  const subjects = [...new Set(subjectPersonIds.filter(id => id && id !== candidatePersonId))]
  if (!candidatePersonId || subjects.length === 0) return out
  try {
    const sb = createServerClient()
    const t = today()

    // (1) Дерево подразделений: parent_id (для спуска) + head_person_id.
    const { data: depts } = await sb.from('departments').select('id, parent_id, head_person_id')
    const childrenOf = new Map<string, string[]>()
    const headed = new Set<string>()
    for (const d of (depts ?? []) as Array<{ id: string; parent_id: string | null; head_person_id: string | null }>) {
      if (d.parent_id) { const a = childrenOf.get(d.parent_id) ?? []; a.push(d.id); childrenOf.set(d.parent_id, a) }
      if (d.head_person_id === candidatePersonId) headed.add(d.id)
    }

    // (2) + активные is_head позиции candidate.
    const { data: pos } = await sb.from('staff_positions')
      .select('department_id, end_date').eq('person_id', candidatePersonId).eq('is_head', true)
    for (const p of (pos ?? []) as Array<{ department_id: string | null; end_date: string | null }>) {
      if (p.department_id && (p.end_date === null || p.end_date > t)) headed.add(p.department_id)
    }
    if (headed.size === 0) return out

    // (3) Домен = возглавляемые подразделения + все их потомки (цикло-безопасно).
    const domain = new Set<string>()
    const stack = [...headed]
    while (stack.length) {
      const cur = stack.pop() as string
      if (domain.has(cur)) continue
      domain.add(cur)
      for (const c of childrenOf.get(cur) ?? []) if (!domain.has(c)) stack.push(c)
    }

    // (4) Активные подразделения всех subjects — одним запросом.
    const { data: sp } = await sb.from('staff_positions')
      .select('person_id, department_id, end_date').in('person_id', subjects)
    const subjDepts = new Map<string, Set<string>>()
    for (const r of (sp ?? []) as Array<{ person_id: string; department_id: string | null; end_date: string | null }>) {
      if (r.department_id && (r.end_date === null || r.end_date > t)) {
        const set = subjDepts.get(r.person_id) ?? new Set<string>()
        set.add(r.department_id); subjDepts.set(r.person_id, set)
      }
    }
    for (const s of subjects) {
      const ds = subjDepts.get(s)
      if (ds) { for (const d of ds) if (domain.has(d)) { out.add(s); break } }
    }
    return out
  } catch {
    return out
  }
}

/**
 * Является ли candidate «выше» subject по иерархии подразделений.
 * candidate возглавляет подразделение subject или любое родительское над ним.
 */
export async function isAboveInHierarchy(candidatePersonId: string, subjectPersonId: string): Promise<boolean> {
  if (!candidatePersonId || !subjectPersonId || candidatePersonId === subjectPersonId) return false
  try {
    const sb = createServerClient()
    const subjectDepts = await activeDeptIds(sb, subjectPersonId)
    if (subjectDepts.length === 0) return false
    const chain = await withAncestors(sb, subjectDepts) // подразделения subject + предки

    if (chain.size === 0) return false
    const chainIds = [...chain]

    // (1) candidate — head_person_id какого-либо подразделения цепочки.
    const { data: headed } = await sb
      .from('departments')
      .select('id')
      .in('id', chainIds)
      .eq('head_person_id', candidatePersonId)
    if ((headed ?? []).length > 0) return true

    // (2) candidate — активный is_head в staff_positions какого-либо из этих подразделений.
    const { data: pos } = await sb
      .from('staff_positions')
      .select('department_id, is_head, end_date')
      .eq('person_id', candidatePersonId)
      .eq('is_head', true)
      .in('department_id', chainIds)
    const t = today()
    for (const p of (pos ?? []) as Array<{ end_date: string | null }>) {
      if (p.end_date === null || p.end_date > t) return true
    }
    return false
  } catch {
    return false
  }
}
