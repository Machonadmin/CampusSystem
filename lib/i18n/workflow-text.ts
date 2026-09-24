// ─── Перевод системных строк движка на язык пользователя (на этапе показа) ───
//
// Системные события (process_events.event_type='system') и часть названий
// хранятся в БД по-русски: их пишут PL/pgSQL RPC (complete_stage / start_process),
// которые мы НЕ трогаем. Поэтому переводим ПРИ ОТОБРАЖЕНИИ по известным шаблонам;
// незнакомая строка возвращается как есть (без потери информации).

type TFunc = (key: string, fallback?: string) => string

export interface SystemEventOptions {
  // Код шаблона этапа, к которому относится событие (если известен).
  stageCode?: string | null
  // Переводчик неймспейса 'education' — для исходов этапов приёма
  // (acceptance_finals.*), которые отличаются от общего events.finals.*.
  tEducation?: TFunc
}

// Этапы, чьи исходы — решения приёмной комиссии (acceptance_finals.*),
// а не общий словарь events.finals.* («נאסף חלקית» ≠ «אישור חלקי»).
const ACCEPTANCE_FINALS_STAGES = new Set(['jewishness'])

// Фиксированные системные строки (пишут RPC reactivate_stage / dormitory gating).
const FIXED_SYSTEM: Record<string, string> = {
  'Подэтап отменён': 'system.substage_cancelled',
  'Подэтап активирован': 'system.substage_activated',
  'Подэтап активирован вручную': 'system.substage_activated_manually',
  'Подэтап переоткрыт для изменения решения': 'system.substage_reopened',
  'Подэтап активирован (нужен пансион)': 'system.substage_activated_dormitory',
  'Этап общежития возвращён (нужен пансион)': 'system.dormitory_stage_restored',
  'Этап общежития пропущен (пансион не нужен)': 'system.dormitory_stage_skipped',
  'Подэтап активирован (пересчёт join после skip общежития)': 'system.substage_activated_after_dormitory_skip',
}

/**
 * Переводит содержимое системного события. t — переводчик неймспейса 'events'
 * (есть подключи system.*, finals.*, process_names.*).
 */
export function translateSystemEvent(content: string, t: TFunc, opts?: SystemEventOptions): string {
  if (!content) return content

  // "Подэтап завершён: <final_code>"
  const completed = content.match(/^Подэтап завершён:\s*(.+)$/)
  if (completed) {
    const code = completed[1].trim()
    const generic = t(`finals.${code}`, code)
    const label = opts?.tEducation && opts.stageCode && ACCEPTANCE_FINALS_STAGES.has(opts.stageCode)
      ? opts.tEducation(`acceptance_finals.${code}`, generic)
      : generic
    return `${t('system.substage_completed')}: ${label}`
  }
  const fixedKey = FIXED_SYSTEM[content]
  if (fixedKey) return t(fixedKey)

  // Общий случай "Подэтап активирован (<причина>)" — причину оставляем как есть.
  const activatedWhy = content.match(/^Подэтап активирован \((.+)\)$/)
  if (activatedWhy) return `${t('system.substage_activated')} (${activatedWhy[1].trim()})`

  // "Процесс «<name>» запущен"
  const started = content.match(/^Процесс «(.+)» запущен$/)
  if (started) {
    const name = started[1].trim()
    return `${t('system.process_started')}: ${t(`process_names.${name}`, name)}`
  }

  return content
}
