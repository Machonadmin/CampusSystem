import { safeInternalPath } from '@/lib/auth/landing'

/**
 * Внешняя ссылка, которую пользователь сохраняет в запись (file_url документа
 * и т.п.) и которая потом рисуется как <a href> или открывается window.open.
 * Пропускаем только http(s): адрес вида javascript:… выполнил бы код от имени
 * того, кто кликнул по ссылке (React 18 такие href не блокирует).
 * Пустое значение → null (поле очищается); недопустимое → undefined.
 */
export function cleanExternalUrl(value: string | null | undefined): string | null | undefined {
  const v = value?.trim()
  if (!v) return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' || u.protocol === 'http:' ? v : undefined
  } catch {
    return undefined
  }
}

/**
 * Ссылка события календаря: внутренний путь приложения (/dashboard/...) или
 * внешний http(s)-адрес. Возвращаемые значения — как у cleanExternalUrl.
 */
export function cleanAppLink(value: string | null | undefined): string | null | undefined {
  const v = value?.trim()
  if (!v) return null
  if (v.startsWith('/')) return safeInternalPath(v) ?? undefined
  return cleanExternalUrl(v)
}
