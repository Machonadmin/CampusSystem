/**
 * «Мои открытые задачи» для клиента — ОДИН запрос на несколько потребителей.
 *
 * Раньше при каждом открытии главной один и тот же список
 * /api/tasks?view=assigned&status=active запрашивался трижды: точка на пункте
 * «Задачи» в меню, блок «הימים הקרובים» и блок «המשימות שלי». Теперь
 * одновременные вызовы делят один запрос, а короткий кэш (несколько секунд)
 * покрывает их всех при загрузке страницы, не задерживая свежесть данных.
 *
 * Возвращает null, если задачи недоступны (нет доступа / сеть) — потребители
 * трактуют это как раньше трактовали !res.ok.
 */

export interface MyActiveTask {
  id: string
  title: string
  due_date: string | null
  due_time?: string | null
  due_all_day?: boolean | null
  priority?: 'urgent' | 'high' | 'normal' | 'low'
  /** Метка «תלמידה קשורה» (API добавляет имя; null — метки нет). */
  student?: { person_id: string; journey_id: string; name: string } | null
}

const TTL_MS = 5000
let cached: { at: number; promise: Promise<MyActiveTask[] | null> } | null = null

export function fetchMyActiveTasks(): Promise<MyActiveTask[] | null> {
  const now = Date.now()
  if (cached && now - cached.at < TTL_MS) return cached.promise
  const promise = fetch('/api/tasks?view=assigned&status=active')
    .then(r => (r.ok ? r.json() : null))
    .then((b: { tasks?: MyActiveTask[] } | null) => (b ? (b.tasks ?? []) : null))
    .catch(() => null)
  cached = { at: now, promise }
  return promise
}
