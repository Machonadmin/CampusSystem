/**
 * ─── Связь «Задачи ↔ Эксплуатация» ───────────────────────────────────────────
 *
 * Требование владельца: задачи и эксплуатация — РАЗНЫЕ вещи с разными людьми, и
 * далеко не всё, что кто-то поручает, касается техслужбы (пример владельца:
 * менеджер поручает секретарю «внести всех учеников до конца дня» — начальнику
 * эксплуатации это не нужно видеть). Поэтому:
 *
 *   1. Задача попадает в модуль «Эксплуатация» ТОЛЬКО если исполнитель —
 *      человек с ролью техслужбы (см. MAINTENANCE_ROLE_CODES), И
 *   2. автор при создании подтвердил галочкой «это задача по эксплуатации».
 *
 * Галочка появляется только когда выбран такой исполнитель, и по умолчанию
 * включена (раз уж выбрали человека из техслужбы — чаще всего это её работа;
 * цена лишней галочки — одна строка в списке, цена забытой — фича не работает).
 *
 * ХРАНЕНИЕ: флаг живёт в tasks.metadata (JSONB), а НЕ в отдельной колонке и не
 * в tasks.module. Причина практическая: миграции в этом проекте применяются
 * владельцем вручную, а metadata существует с первого дня (NOT NULL DEFAULT
 * '{}'), поэтому фича работает сразу после деплоя — нечему быть «ещё не
 * применённым». Такой же приём уже используется для автозадач приёмной
 * комиссии (metadata.source='acceptance', см. lib/workflow/acceptance-tasks.ts).
 *
 * ОДНА ЗАПИСЬ, ДВА ЭКРАНА: отдельная строка в maintenance_requests НЕ создаётся.
 * Это та же самая задача, показанная в двух местах, поэтому «выполнено» в одном
 * месте — это «выполнено» в другом по построению, разъехаться нечему.
 */

/** Роли, носитель которых считается «человеком из техслужбы». */
export const MAINTENANCE_ROLE_CODES = ['maintenance_head', 'maintenance_staff'] as const
export type MaintenanceRoleCode = (typeof MAINTENANCE_ROLE_CODES)[number]

/** Ключ флага внутри tasks.metadata. */
export const MAINTENANCE_FLAG_KEY = 'maintenance'

/** Фильтр для PostgREST `.contains('metadata', …)`. */
export const MAINTENANCE_METADATA_FILTER = { [MAINTENANCE_FLAG_KEY]: true } as const

/** Вход намеренно `unknown`: metadata приходит из БД как Json и из тела запроса
 *  как что угодно — обе функции ниже защищены от любого значения. */
type MetadataLike = unknown

function asRecord(metadata: MetadataLike): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
  return metadata as Record<string, unknown>
}

/**
 * Помечена ли задача как задача по эксплуатации. Строго `true` — строка "true",
 * 1 и прочие «почти истинные» значения НЕ считаются флагом, иначе фильтр в БД
 * (jsonb `@>` сравнивает точно) и проверка в коде разошлись бы.
 */
export function isMaintenanceTask(metadata: MetadataLike): boolean {
  return asRecord(metadata)[MAINTENANCE_FLAG_KEY] === true
}

/**
 * Возвращает НОВЫЙ объект metadata с выставленным/снятым флагом. При снятии
 * ключ удаляется целиком (а не ставится в false), чтобы `@> '{"maintenance":true}'`
 * работал и чтобы в metadata не копился мусор.
 */
export function withMaintenanceFlag(metadata: MetadataLike, on: boolean): Record<string, unknown> {
  const next = { ...asRecord(metadata) }
  if (on) next[MAINTENANCE_FLAG_KEY] = true
  else delete next[MAINTENANCE_FLAG_KEY]
  return next
}

/**
 * Может ли задача вообще быть задачей по эксплуатации: только персональное
 * назначение на человека из техслужбы. Пул отдела/должности сюда не входит —
 * там нет конкретного исполнителя, а владелец описывал именно «я выбираю
 * человека из техслужбы».
 *
 * Fail-closed: не передан исполнитель или он не из техслужбы → false, и
 * вызывающий код обязан снять флаг, даже если клиент его прислал.
 */
export function canBeMaintenanceTask(
  assigneeType: string | null | undefined,
  assigneeId: string | null | undefined,
  maintenancePersonIds: ReadonlySet<string>,
): boolean {
  if (assigneeType !== 'person') return false
  if (!assigneeId) return false
  return maintenancePersonIds.has(assigneeId)
}
