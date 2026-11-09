// Чистые правила (без обращений к БД) — их импортирует и Edge-middleware.
// ─── Права «Учёбы» из ОРГСТРУКТУРЫ ───────────────────────────────────────────
//
// Решение владельца (2026-11-09): место человека в структуре само даёт ему
// права «Учёбы» в его единице и во всём, что ниже неё. Отмечать галочки для
// каждого нового руководителя не нужно; всё сверх этого — личной выдачей от
// того, кто выше (person_privileges), и личный запрет по-прежнему сильнее.
//
//   глава (is_head) и заместитель (is_deputy) — STRUCTURE_LEAD_PRIVILEGES;
//   секретариат (роль studies_secretary + действующая посадка) —
//     STRUCTURE_SECRETARY_PRIVILEGES;
//   учитель — как и раньше, только свои группы (narrowToOwn).
//
// Scope у всех — 'department': область = единицы посадки + всё ниже них
// (getUserDepartmentIds), ровно как у личных выдач.
//
// Сознательно НЕ входят (ответы владельца в документе от 2026-11-09):
//   лиды/абитуриентки (view_leads, view_applicants, …) — только вручную;
//   кодеш-права, проверка еврейства — свои ответственные;
//   manage_tracks — каталог маршрутов уровня всего института;
//   manage_alerts / view_sensitive_alerts — их маршруты не ограничены единицей
//     (проверка без target), с scope='department' они бы не открылись.

export const STRUCTURE_SECRETARY_ROLE = 'studies_secretary'

/** Глава и заместитель единицы. */
export const STRUCTURE_LEAD_PRIVILEGES = [
  'view_students',
  'manage_students',
  'manage_enrollments',
  'manage_class_groups',
  'manage_study_groups',
  'manage_class_teachers',
  'manage_subjects',
  'manage_specialties',
  'mark_attendance',
  'set_grades',
  'set_lesson_topics',
  'write_evaluation',
] as const

/** Секретариат единицы. */
export const STRUCTURE_SECRETARY_PRIVILEGES = [
  'view_students',
  'manage_students',
  'manage_enrollments',
  'manage_class_groups',
  'manage_study_groups',
  'manage_class_teachers',
  'mark_attendance',
  'set_grades',
  'set_lesson_topics',
] as const

/** Модуль, в котором живут эти права (+ 'access', чтобы открылся сам модуль). */
export const STRUCTURE_MODULE = 'education'

export interface StructureSeats {
  /** Единицы, где человек глава (действующая посадка). */
  headUnitIds: string[]
  /** Единицы, где человек заместитель (действующая посадка). */
  deputyUnitIds: string[]
  /** Есть ли у человека хоть одна действующая посадка. */
  hasActiveSeat: boolean
}

export const NO_SEATS: StructureSeats = { headUnitIds: [], deputyUnitIds: [], hasActiveSeat: false }

export interface SeatRow {
  department_id: string | null
  is_head?: boolean | null
  is_deputy?: boolean | null
  end_date: string | null
}

/** Чистая часть: строки staff_positions → посадки. */
export function seatsFromRows(rows: readonly SeatRow[], today: string): StructureSeats {
  const heads = new Set<string>()
  const deputies = new Set<string>()
  let hasActiveSeat = false
  for (const r of rows) {
    if (!(r.end_date === null || r.end_date > today)) continue
    if (!r.department_id) continue
    hasActiveSeat = true
    if (r.is_head) heads.add(r.department_id)
    if (r.is_deputy) deputies.add(r.department_id)
  }
  return { headUnitIds: [...heads], deputyUnitIds: [...deputies], hasActiveSeat }
}

/**
 * Чистая часть: какие права «Учёбы» даёт структура. Пустой массив — ничего.
 * Студенческий вход (principal='student') сюда не доходит: его отсекают раньше.
 */
export function structureEducationPrivileges(seats: StructureSeats, roles: readonly string[]): string[] {
  const out = new Set<string>()
  if (seats.headUnitIds.length > 0 || seats.deputyUnitIds.length > 0) {
    STRUCTURE_LEAD_PRIVILEGES.forEach(p => out.add(p))
  }
  if (seats.hasActiveSeat && roles.includes(STRUCTURE_SECRETARY_ROLE)) {
    STRUCTURE_SECRETARY_PRIVILEGES.forEach(p => out.add(p))
  }
  return [...out]
}

/**
 * Те же права строками role_privileges-вида (module, privilege_code, scope) —
 * чтобы их можно было сложить с правами ролей теми же функциями. Плюс
 * 'education.access', если структура даёт хоть что-то: иначе модуль не виден.
 */
export function structurePrivilegeRows(
  seats: StructureSeats,
  roles: readonly string[],
): { module: string; privilege_code: string; scope: string }[] {
  const codes = structureEducationPrivileges(seats, roles)
  if (codes.length === 0) return []
  return ['access', ...codes].map(code => ({ module: STRUCTURE_MODULE, privilege_code: code, scope: 'department' }))
}

