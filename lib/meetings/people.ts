// ─── Выбор людей на экране «פגישות» — чистые правила ────────────────────────

/** Кому открыт поиск людей: superadmin, владелец с секретарём, секретарь. */
export function canUseMeetingPeople(a: { isSuperadmin: boolean; managesOthers: boolean; hasDelegates: boolean }): boolean {
  return a.isSuperadmin || a.managesOthers || a.hasDelegates
}

/** Кого можно выбрать: сотрудник с активной учётной записью или студентка. */
export function meetingPeopleFilter(withAccount: string[], withJourney: string[]): Set<string> {
  return new Set([...withAccount, ...withJourney])
}
