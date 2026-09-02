/**
 * Часовые квоты преподавателей (spec §3.6 / §6.1). Владелец: квота «в принципе из
 * договора, но Моше может обновлять и добавлять» → хранится Моше-введённой с
 * пометкой источника ('contract'|'manual'). Превышение квоты ТОЛЬКО ПРЕДУПРЕЖДАЕТ
 * (не блокирует) — легко переключить на блокировку одним местом (isOverQuota).
 *
 * assigned_hours = сумма часов (class_groups.hours) курсов кодеша, на которые
 * назначен преподаватель. remaining = approved - assigned.
 */

export interface CourseHours {
  teacherIds: string[]
  hours: number | null
}

/** Сумма назначенных часов по каждому преподавателю. Чистая функция. */
export function sumAssignedHoursByTeacher(courses: CourseHours[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const c of courses) {
    const h = typeof c.hours === 'number' && c.hours > 0 ? c.hours : 0
    if (h === 0) continue
    for (const tid of c.teacherIds) {
      out.set(tid, (out.get(tid) ?? 0) + h)
    }
  }
  return out
}

export function computeRemaining(approvedHours: number, assignedHours: number): number {
  return approvedHours - assignedHours
}

/**
 * Превышена ли квота. Порог сравнения вынесен сюда, чтобы переключение
 * «предупреждать → блокировать» было в одном месте (см. §6.1).
 */
export function isOverQuota(approvedHours: number | null | undefined, assignedHours: number): boolean {
  if (approvedHours === null || approvedHours === undefined) return false
  return assignedHours > approvedHours
}
