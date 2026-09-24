import ruMessages from '@/messages/ru.json'
import heMessages from '@/messages/he.json'
import enMessages from '@/messages/en.json'
import type { Lang } from './translations'

/**
 * Сообщения АКТИВНОЙ локали для передачи в LanguageProvider из серверных
 * layout'ов. Импортируется ТОЛЬКО на сервере: так весь словарь (3 языка,
 * ~640 КБ сырого JSON) больше не попадает в клиентский бандл каждой страницы
 * — клиент получает один язык через RSC-props, остальные догружаются
 * динамически только при переключении языка (см. LanguageContext).
 */
const ALL: Record<Lang, Record<string, unknown>> = {
  ru: ruMessages as Record<string, unknown>,
  he: heMessages as Record<string, unknown>,
  en: enMessages as Record<string, unknown>,
}

export function getServerMessages(locale: Lang): Record<string, unknown> {
  return ALL[locale] ?? ALL.ru
}
