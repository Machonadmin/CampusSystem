import { getSession } from '@/lib/auth/session'
import type { SessionPayload } from '@/lib/auth/jwt'

// ─── Права модуля «Календарь» — лёгкая проверка ──────────────────────────────
//
// Календарь ПЕРСОНАЛЬНЫЙ и self-scoped: это НЕ модуль из PROTECTED_MODULES и он
// НЕ владеет привилегиями module_privileges. Единственное требование — быть
// залогиненным: любой сотрудник получает СВОЙ календарь. Изоляция между
// пользователями обеспечивается не привилегией, а фильтром
// provider_id = session.person_id в КАЖДОМ запросе API (см. app/api/calendar/**).

/**
 * Возвращает сессию залогиненного пользователя или бросает 401.
 *
 * Пример:
 *   const session = await requireCalendarUser()
 *   // все запросы — только по provider_id = session.person_id
 */
export async function requireCalendarUser(): Promise<SessionPayload> {
  const session = await getSession()
  if (!session) {
    throw Object.assign(new Error('Не авторизован'), { status: 401 })
  }
  return session
}
