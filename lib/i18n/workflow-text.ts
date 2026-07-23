// ─── Перевод системных строк движка на язык пользователя (на этапе показа) ───
//
// Системные события (process_events.event_type='system') и часть названий
// хранятся в БД по-русски: их пишут PL/pgSQL RPC (complete_stage / start_process),
// которые мы НЕ трогаем. Поэтому переводим ПРИ ОТОБРАЖЕНИИ по известным шаблонам;
// незнакомая строка возвращается как есть (без потери информации).

type TFunc = (key: string, fallback?: string) => string

/**
 * Переводит содержимое системного события. t — переводчик неймспейса 'events'
 * (есть подключи system.*, finals.*, process_names.*).
 */
export function translateSystemEvent(content: string, t: TFunc): string {
  if (!content) return content

  // "Подэтап завершён: <final_code>"
  const completed = content.match(/^Подэтап завершён:\s*(.+)$/)
  if (completed) {
    const code = completed[1].trim()
    return `${t('system.substage_completed')}: ${t(`finals.${code}`, code)}`
  }
  if (content === 'Подэтап отменён') return t('system.substage_cancelled')
  if (content === 'Подэтап активирован') return t('system.substage_activated')

  // "Процесс «<name>» запущен"
  const started = content.match(/^Процесс «(.+)» запущен$/)
  if (started) {
    const name = started[1].trim()
    return `${t('system.process_started')}: ${t(`process_names.${name}`, name)}`
  }

  return content
}
