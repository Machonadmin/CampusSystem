/**
 * Коды процессов приёмной комиссии.
 *
 * `acceptance_v2`  — ПОСЛЕДОВАТЕЛЬНЫЙ приём (yahadut → limudim →
 *                    pnimiya условно → ishur sofi); авто-стартуется для всех
 *                    новых приёмов.
 *
 * Старые шаблоны `acceptance` (параллельный комитет) и `admission` (v1)
 * удалены вместе с шаблонами в БД (20261012130000) — дел по ним не было.
 * Список оставлен списком, чтобы следующая версия приёма добавлялась сюда.
 *
 * Любой запрос «по приёму» (сводки, подписи, отчёты, автозадачи) берёт коды
 * отсюда: `.in('...process_template.code', ACCEPTANCE_PROCESS_CODES)`.
 */
export const ACCEPTANCE_PROCESS_CODES: string[] = ['acceptance_v2']

/**
 * Роль-подписант этапа «בירור יהדות» переименована: старая `jewishness_officer`
 * («אחראי יהדות») → новая `jewish_studies_manager` («אחראית יהדות», 20260901150000).
 * В шаблоне этапа (stage_templates.required_role_code) всё ещё записана старая
 * роль — из-за этого задачи, колокольчики, доска приёма и виджет «ממתין לחתימתך»
 * доставались только носителям старой роли. Эти роли считаем эквивалентными.
 */
const SIGNER_ROLE_ALIASES: Record<string, string[]> = {
  jewishness_officer: ['jewish_studies_manager'],
  jewish_studies_manager: ['jewishness_officer'],
}

/** Разбирает required_role_code ('a,b') и добавляет эквивалентные роли. */
export function signerRoleCodes(requiredRoleCode: string | null | undefined): string[] {
  const base = (requiredRoleCode ?? '').split(',').map(r => r.trim()).filter(Boolean)
  const out = new Set(base)
  for (const r of base) for (const alias of SIGNER_ROLE_ALIASES[r] ?? []) out.add(alias)
  return [...out]
}

/**
 * Финалы приёма, которые НЕЛЬЗЯ выбрать досрочным закрытием («סגירת התהליך»).
 * Решение владельца 2026-09-24: принять абитуриентку можно только через
 * обычные подписи этапов; досрочно — только отказ/перенос.
 */
export const ACCEPTANCE_EARLY_CLOSE_BLOCKED: readonly string[] = ['admitted', 'admitted_conditional', 'external_studies']
