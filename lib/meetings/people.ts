// ─── Выбор людей на экране «פגישות» — чистые правила ────────────────────────

/** Кому открыт поиск людей: superadmin, владелец с секретарём, секретарь. */
export function canUseMeetingPeople(a: { isSuperadmin: boolean; managesOthers: boolean; hasDelegates: boolean }): boolean {
  return a.isSuperadmin || a.managesOthers || a.hasDelegates
}

/** Кого можно выбрать: сотрудник с активной учётной записью или студентка. */
export function meetingPeopleFilter(withAccount: string[], withJourney: string[]): Set<string> {
  return new Set([...withAccount, ...withJourney])
}

/**
 * Автоматические назначения по должности: секретарь в подразделении ведёт
 * календарь каждого руководителя этого подразделения. Себя не ведёт;
 * read-only (служебные) учётные записи руководителями не считаются.
 */
export function deriveDelegations(
  secretaries: Array<{ person_id: string; department_id: string }>,
  heads: Array<{ person_id: string; department_id: string }>,
  readOnlyIds: string[],
): Array<{ owner_id: string; delegate_id: string }> {
  const ro = new Set(readOnlyIds)
  const out = new Map<string, { owner_id: string; delegate_id: string }>()
  for (const s of secretaries) {
    for (const h of heads) {
      if (h.department_id !== s.department_id || h.person_id === s.person_id || ro.has(h.person_id)) continue
      out.set(`${h.person_id}|${s.person_id}`, { owner_id: h.person_id, delegate_id: s.person_id })
    }
  }
  return [...out.values()]
}
